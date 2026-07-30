"""Contrats que deux fichiers doivent tenir ENSEMBLE, vérifiés par la CI.

Le projet en compte plusieurs qui ne vivaient que dans un commentaire « keep in
sync ». Un commentaire ne casse pas la CI : il se lit une fois, puis se périme
en silence, et la panne arrive des mois plus tard chez une troupe.

Ces tests ne vérifient donc pas un comportement mais une COHÉRENCE entre
fichiers, et ils sont volontairement écrits en lisant les sources plutôt qu'en
recopiant les valeurs attendues (recopier ne ferait que déplacer le problème).

Ils tournent avec le reste de la suite Python, donc dans build.yml, donc à
chaque push de code comme après chaque dépôt.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_manifest import COLOR_PATTERN
from common import REPO_ROOT
from process_uploads import LINE_ID_PATTERN

SRC = REPO_ROOT / "src"
THEME_CSS = SRC / "shared" / "theme.css"
PAGES_JS = SRC / "shared" / "pages.js"
REDUCER_JS = SRC / "editor" / "reducer.js"
CHARACTER_COLORS_JS = SRC / "shared" / "characterColors.js"

# Tokens qu'une règle de bandeau partagé ne doit pas consommer : chacun est
# re-skinné quelque part, donc le bandeau ne rendrait plus pareil d'une page à
# l'autre. `--accent`, `--font-serif` et `--shadow` le sont par l'éditeur
# (direction « Rail ») ; `--page-mark` et `--page-mark-soft` le sont par CHAQUE
# page, via la classe `page-<clé>` que les deux bandeaux posent sur leur racine.
FORBIDDEN_IN_HEADER = (
    "--accent",
    "--font-serif",
    "--shadow",
    "--page-mark",
    "--page-mark-soft",
)

# Une seule exception, et elle est délibérée : le retour à l'accueil. Il dit la
# MARQUE et non la page, donc il porte lui-même `page-home` (HomeLink.jsx), ce
# qui ramène son sceau au sable des masques sur les quatre pages au lieu de
# prendre le vert de l'Avancement ou le violet de l'Édition. Ce garde ne lit que
# du CSS et ne peut pas voir cette classe posée en JSX : l'exemption est donc
# écrite ici, ce qui vaut acte. Elle ne porte QUE sur les tokens de sceau.
HEADER_TOKEN_EXEMPT_PREFIX = ".play-header-home"
EXEMPT_TOKENS = ("--page-mark", "--page-mark-soft")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def css(path: Path) -> str:
    """CSS sans ses commentaires : ce fichier est très commenté, et un
    commentaire qui cite un token ou une classe n'est pas une déclaration."""
    return re.sub(r"/\*.*?\*/", "", read(path), flags=re.DOTALL)


class TestLineIdPattern(unittest.TestCase):
    """Les ids de répliques nomment les mp3. Le navigateur les mint et les
    valide (SAFE_ID), l'Action les revalide à l'arrivée (LINE_ID_PATTERN). Les
    deux gardes doivent dire EXACTEMENT la même chose : plus stricte côté
    Action, un acteur verrait son ZIP refusé pour des ids que l'éditeur lui a
    donnés ; plus laxiste, un id hostile nommerait un fichier."""

    def test_safe_id_and_line_id_pattern_are_the_same_expression(self):
        match = re.search(r"export const SAFE_ID = /(.+?)/;", read(REDUCER_JS))
        self.assertIsNotNone(match, "SAFE_ID introuvable dans src/editor/reducer.js")
        self.assertEqual(
            match.group(1),
            LINE_ID_PATTERN.pattern,
            "SAFE_ID (src/editor/reducer.js) et LINE_ID_PATTERN "
            "(scripts/process_uploads.py) ont divergé : ils nomment les mêmes "
            "fichiers mp3 et doivent rester identiques au caractère près.",
        )

    def test_the_pattern_stays_anchored_and_bounded(self):
        # Ancré aux deux bouts (sinon « ../x-1 » passerait par le milieu) et
        # borné (un id nomme un fichier).
        pattern = LINE_ID_PATTERN.pattern
        self.assertTrue(pattern.startswith("^"))
        self.assertTrue(pattern.endswith("$"))
        self.assertIn("{1,", pattern)


class TestCharacterPalette(unittest.TestCase):
    """La couleur d'un personnage est écrite par l'éditeur (palette JS) et
    recopiée par l'Action jusqu'au manifest (COLOR_PATTERN). La palette n'a
    qu'une implémentation, en JS, et le Python n'en valide que la FORME : ce
    garde vérifie que la forme acceptée couvre bien toute la palette.

    Sans lui, ajouter une couleur écrite autrement (« #FFF », un nom CSS, un
    `oklch()`) la ferait silencieusement tomber du manifest, et la page
    Répartition colorerait ce personnage comme un personnage sans couleur."""

    def palette(self) -> list[str]:
        body = re.search(
            r"export const CHARACTER_COLORS = \[(.*?)^\];",
            read(CHARACTER_COLORS_JS),
            re.DOTALL | re.MULTILINE,
        )
        self.assertIsNotNone(body, "CHARACTER_COLORS introuvable dans characterColors.js")
        return re.findall(r'"(#[0-9a-fA-F]+)"', body.group(1))

    def test_the_palette_is_found_and_has_its_twenty_colours(self):
        # Un garde qui passerait sur une liste vide ne garde rien. Vingt, parce
        # que c'est Tableau 10 puis les dix teintes claires de tab20.
        palette = self.palette()
        self.assertEqual(len(palette), 20, f"palette lue : {palette}")
        self.assertEqual(len(set(palette)), 20, "deux personnages ne peuvent pas être de la même couleur")

    def test_every_palette_colour_survives_the_python_validation(self):
        for color in self.palette():
            self.assertIsNotNone(
                COLOR_PATTERN.match(color),
                f"{color} (src/shared/characterColors.js) est refusée par "
                f"COLOR_PATTERN (scripts/build_manifest.py), donc elle ne "
                f"traverserait pas le manifest.",
            )

    def test_the_python_validation_stays_anchored(self):
        # Sans ancre de fin, « #1f77b4; background: url(...) » passerait, et la
        # valeur part dans un attribut `style`.
        self.assertTrue(COLOR_PATTERN.pattern.endswith(r"\Z"))


class TestReservedHeaderTokens(unittest.TestCase):
    """Le bandeau partagé rend identiquement sur toutes les pages, re-skin
    « Rail » de l'éditeur compris. Ça tient à une convention : les tokens
    `--header-*` sont déclarés dans theme.css et redéfinis nulle part.

    La liste n'est pas écrite ici, elle est LUE dans theme.css : un nouveau
    token réservé est couvert d'office."""

    def reserved_tokens(self) -> set[str]:
        root = re.search(r":root\s*\{(.*?)\}", css(THEME_CSS), re.DOTALL)
        self.assertIsNotNone(root, ":root introuvable dans theme.css")
        return set(re.findall(r"(--header-[a-z-]+)\s*:", root.group(1)))

    def test_there_are_reserved_tokens_to_guard(self):
        # Si la convention disparaissait, ce test échouerait au lieu de passer
        # sur un ensemble vide (un garde qui ne garde rien est pire que rien).
        self.assertGreaterEqual(len(self.reserved_tokens()), 3)

    def test_no_page_css_redefines_them(self):
        reserved = self.reserved_tokens()
        offenders = []
        for page_css in sorted(SRC.rglob("*.css")):
            if page_css == THEME_CSS:
                continue
            for token in reserved:
                if re.search(rf"{re.escape(token)}\s*:", css(page_css)):
                    offenders.append(f"{page_css.relative_to(REPO_ROOT)} redéfinit {token}")
        self.assertEqual(
            offenders,
            [],
            "Un token réservé au bandeau partagé est redéfini par une page : "
            "le bandeau ne rendrait plus pareil d'un écran à l'autre. "
            + " ; ".join(offenders),
        )

    def test_the_shared_header_never_consumes_a_reskinnable_token_for_its_identity(self):
        # L'identité du bandeau (encre de la marque, serif du titre, ombre) doit
        # passer par les tokens réservés. Les tokens surveillés sont re-skinnés
        # par une page ou l'autre : les voir ici voudrait dire que le bandeau
        # change d'aspect selon la page.
        theme = css(THEME_CSS)
        # Le retrait de tête est toléré des deux côtés de la règle : sans lui, le
        # garde ne voyait que les règles de premier niveau et laissait passer
        # tout ce qui vit dans un `@media`, où le bandeau a justement ses règles
        # mobiles (taille des sceaux, dessin du logo de retour).
        header_rules = re.findall(
            r"^[ \t]*(\.page-header[^{]*|\.play-header[^{]*)\{(.*?)^[ \t]*\}",
            theme,
            re.DOTALL | re.MULTILINE,
        )
        self.assertGreater(len(header_rules), 0, "aucune règle de bandeau trouvée")
        leaks = []
        for selector, body in header_rules:
            exempt = selector.strip().startswith(HEADER_TOKEN_EXEMPT_PREFIX)
            for token in FORBIDDEN_IN_HEADER:
                if exempt and token in EXEMPT_TOKENS:
                    continue
                # var(--shadow) ne doit pas être confondu avec var(--shadow-hover),
                # ni var(--page-mark) avec var(--page-mark-soft) : la parenthèse
                # fermante fait la différence.
                if re.search(rf"var\(\s*{re.escape(token)}\s*\)", body):
                    leaks.append(f"{selector.strip()} consomme var({token})")
        self.assertEqual(
            leaks,
            [],
            "Le bandeau partagé tire son identité d'un token qu'une page peut "
            "re-skinner ; il faut un token réservé (--header-*). " + " ; ".join(leaks),
        )


class TestPageSeals(unittest.TestCase):
    """`PAGES` (pages.js) est la source de vérité de l'identité des pages, mais
    leurs COULEURS vivent en CSS (`.page-<clé>` de theme.css). Rien dans le code
    ne relie les deux : une page ajoutée sans sa classe rendrait un sceau
    incolore, et personne ne le verrait avant de l'ouvrir."""

    def page_keys(self) -> set[str]:
        body = re.search(r"export const PAGES = \{(.*?)^\};", read(PAGES_JS), re.DOTALL | re.MULTILINE)
        self.assertIsNotNone(body, "PAGES introuvable dans src/shared/pages.js")
        return set(re.findall(r"^  ([a-zA-Z]+): \{", body.group(1), re.MULTILINE))

    def test_pages_are_found(self):
        self.assertGreaterEqual(len(self.page_keys()), 5)

    def seal_declarations(self) -> dict[str, set[str]]:
        """{clé de page: variables déclarées} en lisant les blocs de theme.css.

        Les sélecteurs sont groupés (`.page-home, .page-rehearsal, …`), donc on
        découpe la liste de sélecteurs de chaque bloc plutôt que de chercher
        chaque classe une par une."""
        declared: dict[str, set[str]] = {}
        for selectors, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css(THEME_CSS)):
            variables = set(re.findall(r"(--page-mark(?:-soft)?)\s*:", body))
            if not variables:
                continue
            for selector in selectors.split(","):
                found = re.fullmatch(r"\.page-([a-z]+)", selector.strip())
                if found:
                    declared.setdefault(found.group(1), set()).update(variables)
        return declared

    def test_every_page_has_its_two_seal_colours(self):
        declared = self.seal_declarations()
        missing = []
        for key in sorted(self.page_keys()):
            for variable in ("--page-mark", "--page-mark-soft"):
                if variable not in declared.get(key, set()):
                    missing.append(f"{key} : {variable} manquant")
        self.assertEqual(
            missing,
            [],
            "Une page n'a pas son sceau complet dans theme.css : son sceau "
            "rendrait sans couleur. " + " ; ".join(missing),
        )

    def test_no_seal_colour_is_declared_for_a_page_that_does_not_exist(self):
        orphans = sorted(set(self.seal_declarations()) - self.page_keys())
        self.assertEqual(
            orphans,
            [],
            "theme.css colore une page absente de PAGES (page supprimée ?) : "
            + ", ".join(orphans),
        )

    def seal_values(self) -> dict[str, dict[str, str]]:
        """{clé de page: {variable: hex}}, en lisant theme.css comme ci-dessus."""
        values: dict[str, dict[str, str]] = {}
        for selectors, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css(THEME_CSS)):
            found_vars = dict(re.findall(r"(--page-mark(?:-soft)?)\s*:\s*(#[0-9a-fA-F]{6})", body))
            if not found_vars:
                continue
            for selector in selectors.split(","):
                found = re.fullmatch(r"\.page-([a-z]+)", selector.strip())
                if found:
                    values.setdefault(found.group(1), {}).update(found_vars)
        return values

    def test_each_html_favicon_and_theme_colour_match_its_seal(self):
        """Le favicon d'une page EST sa pastille de sceau : tuile en
        `--page-mark-soft`, glyphe en `--page-mark`, et `theme-color` en
        `--page-mark` plein. Les hex y sont forcément recopiés (une balise
        `<link>` ne lit pas une variable CSS), donc rien n'empêchait le favicon de
        garder la couleur de la page dont on l'a copié : c'est exactement ce qui
        arrive quand on ajoute une page en dupliquant le `.html` d'une autre, et
        ça ne se voit que dans l'onglet, ou pire, dans la vignette du lien que la
        troupe se partage.

        La correspondance page <-> fichier passe par `PAGES[clé].href`, seule
        source de vérité du lien entre les deux."""
        pages_js = read(PAGES_JS)
        # {clé: fichier html}, lu dans PAGES et pas deviné depuis le nom.
        hrefs = dict(
            re.findall(r"^  ([a-zA-Z]+): \{\s*\n\s*href: \"\./([a-z]+\.html)\"", pages_js, re.MULTILINE)
        )
        self.assertGreaterEqual(len(hrefs), 5, f"hrefs lus : {hrefs}")
        values = self.seal_values()
        problems = []
        for key, filename in sorted(hrefs.items()):
            seal = values.get(key)
            if not seal:
                continue  # déjà couvert par test_every_page_has_its_two_seal_colours
            html = read(REPO_ROOT / filename)
            # Les deux accueils partagent le favicon des masques, dont les aplats
            # d'intérieur reprennent aussi la teinte douce : on ne vérifie que la
            # PRÉSENCE des deux hex, pas leur nombre d'occurrences.
            icon = re.search(r'rel="icon" href="([^"]*)"', html)
            self.assertIsNotNone(icon, f"{filename} n'a pas de favicon")
            icon_href = icon.group(1).lower()
            for variable in ("--page-mark", "--page-mark-soft"):
                expected = seal[variable].lower().lstrip("#")
                if f"%23{expected}" not in icon_href:
                    problems.append(f"{filename} : le favicon n'emploie pas {variable} (#{expected})")
            theme = re.search(r'name="theme-color" content="(#[0-9a-fA-F]{6})"', html)
            self.assertIsNotNone(theme, f"{filename} n'a pas de theme-color")
            if theme.group(1).lower() != seal["--page-mark"].lower():
                problems.append(
                    f"{filename} : theme-color {theme.group(1)} au lieu de "
                    f"{seal['--page-mark']} (--page-mark de .page-{key})"
                )
        self.assertEqual(problems, [], "Favicon ou theme-color désaccordé du sceau. " + " ; ".join(problems))

    def test_every_page_has_its_apple_touch_icon(self):
        """iOS ne lit ni les favicons SVG ni les `data:` URI : chaque page a son
        PNG, et un `href` qui pointe vers un fichier absent laisse iOS inventer
        une vignette (une capture de la page, illisible en petit)."""
        pages_js = read(PAGES_JS)
        hrefs = dict(
            re.findall(r"^  ([a-zA-Z]+): \{\s*\n\s*href: \"\./([a-z]+\.html)\"", pages_js, re.MULTILINE)
        )
        missing = []
        for key, filename in sorted(hrefs.items()):
            found = re.search(r'rel="apple-touch-icon"[^>]*href="/([^"]+)"', read(REPO_ROOT / filename))
            if not found:
                missing.append(f"{filename} : pas d'apple-touch-icon")
            elif not (REPO_ROOT / "public" / found.group(1)).is_file():
                missing.append(f"{filename} : public/{found.group(1)} absent")
        self.assertEqual(missing, [], " ; ".join(missing))


class TestPageEntries(unittest.TestCase):
    """Chaque page déclarée doit être une page qui existe : un `href` de PAGES
    sans .html à la racine est un lien mort dans l'accueil ou un bandeau, et
    une entrée de vite.config.js sans .html casse le build."""

    def test_every_pages_href_points_to_a_real_html_file(self):
        hrefs = re.findall(r'href: "\./([a-z]+\.html)"', read(PAGES_JS))
        self.assertGreaterEqual(len(hrefs), 5)
        for href in hrefs:
            self.assertTrue((REPO_ROOT / href).is_file(), f"{href} déclaré dans PAGES mais absent")

    def test_every_vite_entry_exists_and_every_html_is_an_entry(self):
        config = read(REPO_ROOT / "vite.config.js")
        entries = set(re.findall(r'resolve\(ROOT, "([a-z]+\.html)"\)', config))
        on_disk = {p.name for p in REPO_ROOT.glob("*.html")}
        self.assertEqual(
            entries,
            on_disk,
            "Les entrées de vite.config.js et les .html de la racine ont divergé : "
            "une entrée sans fichier casse le build, un fichier sans entrée n'est "
            "jamais construit ni déployé.",
        )


if __name__ == "__main__":
    unittest.main()
