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

import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_manifest import COLOR_PATTERN, DEFAULT_LANGUAGE, LANGUAGES
from build_script_pdf import STRUCTURE, _TENS, _UNITS, roman_numeral
from common import PLAY_ID_PATTERN, REPO_ROOT, play_data_dir, play_ids
from process_uploads import LINE_ID_PATTERN

SRC = REPO_ROOT / "src"
THEME_CSS = SRC / "shared" / "theme.css"
PAGES_JS = SRC / "shared" / "pages.js"
# Les gabarits des sept pages d'une pièce, instanciés dans le dossier de chaque
# pièce au build (cf. vite.config.js).
PAGES_DIR = REPO_ROOT / "pages"
PLAYS_JS = SRC / "shared" / "plays.js"
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


def published_scripts():
    """(identifiant, script) de chaque pièce du dépôt qui porte un script lisible.

    Les gardes qui s'en servent inspectent l'ARBRE réel et pas du code : ils valent
    donc pour toutes les pièces d'un coup, sans liste à tenir, et une pièce ajoutée
    demain y entre d'elle-même. Une pièce sans script est sautée : le dossier peut
    naître d'un dépôt refusé, et c'est son journal qui le raconte."""
    for play_id in play_ids():
        path = play_data_dir(play_id) / "script.json"
        if path.exists():
            yield play_id, json.loads(read(path))


def css(path: Path) -> str:
    """CSS sans ses commentaires : ce fichier est très commenté, et un
    commentaire qui cite un token ou une classe n'est pas une déclaration."""
    return re.sub(r"/\*.*?\*/", "", read(path), flags=re.DOTALL)


def js_without_comments(source: str) -> str:
    """JS sans ses commentaires, en sautant les chaînes.

    Un `re.sub` suffisait pour le CSS, pas ici : ce dépôt commente énormément, et
    ses commentaires CITENT du code (T.jsx documente `<T k="key" …>`, ce qui
    faisait relever une clé « key » qui n'existe pas). À l'inverse, découper
    naïvement sur `//` couperait au milieu d'une URL dans une chaîne.

    Limite connue et acceptée : une expression régulière contenant un guillemet
    serait prise pour le début d'une chaîne. Aucune source du dépôt n'en a, et le
    seul effet serait un relevé partiel, jamais un faux positif.
    """
    out: list[str] = []
    i, n = 0, len(source)
    while i < n:
        char = source[i]
        if char in "\"'`":
            out.append(char)
            i += 1
            while i < n:
                if source[i] == "\\":
                    out.append(source[i : i + 2])
                    i += 2
                    continue
                out.append(source[i])
                i += 1
                if source[i - 1] == char:
                    break
            continue
        if char == "/" and i + 1 < n:
            if source[i + 1] == "/":
                while i < n and source[i] != "\n":
                    i += 1
                continue
            if source[i + 1] == "*":
                end = source.find("*/", i + 2)
                i = n if end == -1 else end + 2
                continue
        out.append(char)
        i += 1
    return "".join(out)


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


class TestPlayIdPattern(unittest.TestCase):
    """L'identifiant d'une pièce nomme un DOSSIER du dépôt (`plays/<id>/`,
    `uploads/<id>/`) et un segment d'URL du site publié. Le navigateur le mint et
    le valide (SAFE_PLAY_ID), l'Action le revalide avant d'en faire un chemin
    (PLAY_ID_PATTERN). Même contrat que les ids de répliques, à un détail près qui
    compte : là où un id de réplique nomme un fichier, celui-ci nomme un dossier
    qu'un fichier déposé désigne, donc les faire diverger ferait refuser un dépôt
    pour un identifiant que le site vient lui-même d'écrire."""

    def test_safe_play_id_and_play_id_pattern_are_the_same_expression(self):
        match = re.search(r"export const SAFE_PLAY_ID = /(.+?)/;", read(PLAYS_JS))
        self.assertIsNotNone(match, "SAFE_PLAY_ID introuvable dans src/shared/plays.js")
        self.assertEqual(
            match.group(1),
            PLAY_ID_PATTERN.pattern,
            "SAFE_PLAY_ID (src/shared/plays.js) et PLAY_ID_PATTERN "
            "(scripts/common.py) ont divergé : ils nomment les mêmes dossiers et "
            "doivent rester identiques au caractère près.",
        )

    def test_the_pattern_stays_anchored_and_bounded(self):
        pattern = PLAY_ID_PATTERN.pattern
        self.assertTrue(pattern.startswith("^"))
        self.assertTrue(pattern.endswith("$"))
        self.assertIn("{0,", pattern)

    def test_the_pattern_accepts_what_slugify_produces(self):
        # `slugify` (src/shared/data.js) est ce qui mint l'identifiant : minuscules,
        # chiffres et tirets, sans tiret aux extrémités. Ce garde vaut acte que le
        # motif ne refuse pas la sortie de la seule fonction qui l'alimente.
        for good in ("transport-de-femmes", "le-malade-imaginaire", "piece2", "a"):
            self.assertIsNotNone(PLAY_ID_PATTERN.fullmatch(good), good)
        for bad in ("-tiret-en-tete", "Majuscule", "avec espace", "accentué", "a" * 65, ""):
            self.assertIsNone(PLAY_ID_PATTERN.fullmatch(bad), bad)


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
            html = read(PAGES_DIR / filename)
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
            found = re.search(r'rel="apple-touch-icon"[^>]*href="/([^"]+)"', read(PAGES_DIR / filename))
            if not found:
                missing.append(f"{filename} : pas d'apple-touch-icon")
            elif not (REPO_ROOT / "public" / found.group(1)).is_file():
                missing.append(f"{filename} : public/{found.group(1)} absent")
        self.assertEqual(missing, [], " ; ".join(missing))


class TestPageEntries(unittest.TestCase):
    """Chaque page déclarée doit être une page qui existe : un `href` de PAGES
    sans gabarit dans `pages/` est un lien mort dans l'accueil ou un bandeau, et
    une entrée de vite.config.js sans .html casse le build."""

    def test_every_pages_href_points_to_a_real_html_file(self):
        hrefs = re.findall(r'href: "\./([a-z]+\.html)"', read(PAGES_JS))
        self.assertGreaterEqual(len(hrefs), 5)
        for href in hrefs:
            self.assertTrue((PAGES_DIR / href).is_file(), f"{href} déclaré dans PAGES mais absent")

    def test_every_root_html_is_a_vite_entry(self):
        """Les deux `.html` de la racine sont les seules entrées écrites en clair :
        le sélecteur de pièce et la gestion des pièces. Une de plus sans entrée ne
        serait jamais construite ni déployée."""
        config = read(REPO_ROOT / "vite.config.js")
        entries = set(re.findall(r'resolve\(ROOT, "([a-z]+\.html)"\)', config))
        on_disk = {p.name for p in REPO_ROOT.glob("*.html")}
        self.assertEqual(
            entries,
            on_disk,
            "Les entrées racine de vite.config.js et les .html de la racine ont "
            "divergé : une entrée sans fichier casse le build, un fichier sans "
            "entrée n'est jamais construit ni déployé.",
        )

    def test_every_play_page_template_is_instantiated_by_the_build(self):
        """Les sept pages d'une pièce sont des GABARITS (`pages/*.html`), instanciés
        dans le dossier de chaque pièce par vite.config.js. La liste du config et les
        gabarits sur le disque doivent coïncider exactement : un gabarit absent de la
        liste ne serait jamais écrit, donc la page rendrait un 404 chez la troupe, et
        un nom de la liste sans gabarit ferait échouer le build de toutes les pièces."""
        config = read(REPO_ROOT / "vite.config.js")
        declared = re.search(r"const PLAY_PAGES = \[([^\]]*)\]", config)
        self.assertIsNotNone(declared, "PLAY_PAGES introuvable dans vite.config.js")
        listed = set(re.findall(r'"([a-z]+)"', declared.group(1)))
        on_disk = {p.stem for p in PAGES_DIR.glob("*.html")}
        self.assertEqual(
            listed,
            on_disk,
            "PLAY_PAGES (vite.config.js) et les gabarits de pages/ ont divergé.",
        )

    def test_the_play_pages_cover_every_page_of_the_site(self):
        """Et ces gabarits sont exactement les pages que PAGES déclare, plus le second
        accueil : sans ce garde, une page ajoutée à PAGES pourrait n'avoir de gabarit
        pour personne, et ses cartes d'accueil mèneraient à un 404."""
        keys = set(re.findall(r"^  ([a-zA-Z]+): \{", read(PAGES_JS), re.MULTILINE))
        # `home` est l'accueil d'une pièce (`index.html`), `respo` son jumeau du
        # responsable, qui n'est pas une entrée de PAGES.
        expected = (keys - {"home"}) | {"index", "respo"}
        self.assertEqual(expected, {p.stem for p in PAGES_DIR.glob("*.html")})


class TestCatalogues(unittest.TestCase):
    """Les gardes de l'i18n, et c'est ici que se joue la sûreté du bilingue.

    Le projet n'a AUCUN test de composant, par choix (cf. CLAUDE.md), donc rien
    ne rend les pages pour vérifier leurs textes. Or une refonte de plusieurs
    centaines de chaînes casse toujours de deux façons : une clé mal tapée, qui
    s'affiche en clair à l'écran, et une chaîne oubliée, qui reste en français
    dans l'UI anglaise. Les deux premiers tests forment une pince autour de la
    première, les trois gardes de texte autour de la seconde, en lecture
    statique, sans rendu et sans dépendance.

    La parité entre les deux catalogues, elle, est vérifiée côté JS
    (src/shared/locales/parity.test.js) : elle demande Intl.PluralRules, que
    Python n'a pas.
    """

    LOCALES_DIR = SRC / "shared" / "locales"

    def catalogue_keys(self, locale: str) -> set[str]:
        """Les clés déclarées dans un catalogue, lues à plat.

        On lit la source plutôt que d'exécuter le JS : la CI Python n'a pas de
        moteur JS, et les clés sont des littéraux `"a.b.c":` en début de ligne.
        """
        source = read(self.LOCALES_DIR / f"{locale}.js")
        return set(re.findall(r'^  "([a-zA-Z0-9_.]+)":', source, re.MULTILINE))

    def test_catalogues_are_found_and_not_empty(self):
        # Sans ça, tous les tests ci-dessous passeraient sur un ensemble vide.
        for locale in ("fr", "en"):
            self.assertGreaterEqual(
                len(self.catalogue_keys(locale)), 10, f"catalogue {locale} introuvable ou vide"
            )

    def scanned_files(self):
        """Les sources du front, hors tests et hors catalogues."""
        for path in sorted(SRC.rglob("*.js*")):
            if path.name.endswith(".test.js") or path.parent == self.LOCALES_DIR:
                continue
            yield path

    def used_keys(self) -> dict[str, set[str]]:
        """{clé utilisée: {fichiers}} pour toute clé écrite en clair dans le code.

        Une clé de catalogue voyage par exactement deux chemins, et c'est une
        convention que ce relevé rend exécutoire :

        1. elle est passée à `t(…)` ou à `<T k="…">`, y compris au milieu d'une
           expression (`t(canUndo ? "editor.undo.tip" : "editor.undo.none")`) :
           d'où le balayage de l'appel ENTIER à parenthèses équilibrées, là où un
           `t\\(\\s*"…"` ne voyait que le premier cas ;
        2. elle vit dans une table dont le NOM dit qu'elle en contient
           (`CHARACTER_COLOR_KEYS`, `KIND_LABEL_KEY`), parce que l'appariement
           rang par rang avec des couleurs ou des types de fichier se vérifie là
           où ces valeurs vivent, pas dans le JSX ;
        3. elle est le libellé de page passé à `mountPage(…)`, qui le rend au
           `<title>` du document (`applyDocumentLanguage`). Les sept pages d'une
           pièce y passent une clé `page.<x>.label`, que le motif des clés composées
           couvrait déjà par accident ; les deux pages RACINE, elles, n'ont pas de
           clé `page.*` (elles ne sont pas des pages de pièce), et sans ce troisième
           chemin leurs libellés se lisaient comme des clés orphelines.

        Reste invisible ici, et c'est assumé : une clé COMPOSÉE à l'exécution
        (`page.${page}.label`, `rail.${key}.tip`). Elles sont couvertes par motif
        dans `test_no_catalogue_key_is_declared_and_never_used`, et par
        `test_every_page_key_has_its_label_and_desc` pour les pages.
        """
        used: dict[str, set[str]] = {}
        for path in self.scanned_files():
            # Sans les commentaires : T.jsx documente son propre usage avec un
            # `<T k="key" …>` d'exemple, qui se relevait comme une vraie clé.
            source = js_without_comments(read(path))
            found = [
                key
                for callee in ("t", "mountPage")
                for call in self.balanced_calls(source, callee)
                # Au moins un point : toute clé de catalogue est dotée, et ce
                # balayage voit aussi les littéraux qui ne sont pas des clés
                # (`t(pageLabelKey("dashboard"))`).
                for key in re.findall(r'"([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)"', call)
            ]
            found += re.findall(r'<T\s[^>]*?\bk="([a-zA-Z0-9_.]+)"', source)
            for table in re.findall(r"\b[A-Z][A-Z0-9_]*KEYS?\b\s*=\s*[\[{](.*?)[\]}];", source, re.S):
                found += re.findall(r'"([a-zA-Z0-9_.]+)"', table)
            for key in found:
                used.setdefault(key, set()).add(path.relative_to(REPO_ROOT).as_posix())
        return used

    @staticmethod
    def balanced_calls(source: str, callee: str) -> list[str]:
        """Le contenu de chaque `<callee>(…)`, parenthèses équilibrées : sans ça, un
        argument qui contient lui-même un appel (`t(pageLabelKey("editor"))`) ou une
        condition (`t(canUndo ? "a" : "b")`) échappait au relevé."""
        calls = []
        for match in re.finditer(rf"\b{re.escape(callee)}\(", source):
            depth, i = 1, match.end()
            while i < len(source) and depth > 0:
                if source[i] == "(":
                    depth += 1
                elif source[i] == ")":
                    depth -= 1
                i += 1
            calls.append(source[match.end() : i - 1])
        return calls

    def test_every_key_used_in_the_code_exists_in_both_catalogues(self):
        # LE garde qui remplace le mieux les tests de composant absents : une clé
        # mal tapée s'affiche telle quelle à l'écran, et seul un passage sur la
        # page concernée le montrerait.
        used = self.used_keys()
        self.assertGreaterEqual(len(used), 5, "aucun appel à t() trouvé : le relevé a-t-il cassé ?")
        missing = []
        for locale in ("fr", "en"):
            declared = self.catalogue_keys(locale)
            for key, files in sorted(used.items()):
                if key not in declared:
                    missing.append(f"{key} ({locale}) utilisée dans {', '.join(sorted(files))}")
        self.assertEqual(
            missing,
            [],
            "Une clé utilisée dans le code n'est dans aucun catalogue : elle "
            "s'affichera en clair à l'écran. " + " ; ".join(missing),
        )

    def test_no_catalogue_key_is_declared_and_never_used(self):
        """Le garde symétrique du précédent, et il s'est prouvé tout seul : une clé
        écrite dans les deux catalogues mais jamais appelée signale une chaîne
        qu'on a cru traduire et qui est restée en dur dans le JSX (c'est
        exactement ce qui était arrivé à `common.loadingScript`, l'éditeur gardant
        son « Chargement du script… » littéral).

        Le garde « toute clé utilisée existe » ne peut pas voir ce cas : il ne
        regarde que dans un sens."""
        used = set(self.used_keys())
        # Les clés COMPOSÉES à l'exécution sont invisibles au relevé littéral : on
        # les couvre par motif, ce qui vaut acte. Chacune est bâtie à un seul
        # endroit, nommé ici :
        #   page.<x>.label|desc      pageLabelKey / pageDescKey (pages.js)
        #   structure.language.<xx>  la liste LOCALES (StructurePanel.jsx)
        #   rail.<x>[.tip]           la bande d'icônes (EditorRail.jsx)
        #   recorder.status.<x>      l'étiquette d'une réplique (recorder/App.jsx)
        # `test_every_page_key_has_its_label_and_desc` vérifie les premières par
        # ailleurs.
        built_by_helper = re.compile(
            r"^(page\.[a-z]+\.(label|desc)"
            r"|structure\.language\.[a-z]{2}"
            r"|rail\.[a-z]+(\.tip)?"
            r"|recorder\.status\.[a-z]+)$"
        )
        orphans = sorted(
            key
            for key in self.catalogue_keys("fr")
            if key not in used and not built_by_helper.match(key)
        )
        self.assertEqual(
            orphans,
            [],
            "Clé déclarée dans les catalogues et jamais appelée : la chaîne "
            "correspondante est probablement restée en dur dans le JSX. "
            + ", ".join(orphans),
        )

    # ------------------------------------------------------------------------
    # Les trois gardes « plus une chaîne oubliée ». Ils surveillent TOUT `src/`,
    # sans liste de fichiers à tenir : une page neuve est donc couverte d'office.
    # C'était l'inverse pendant la traduction (un ensemble MIGRATED qui grandissait
    # phase par phase, pour ne pas garder une CI rouge tout un chantier), et cette
    # liste est précisément ce qui a laissé passer cinq pages entières : les
    # fichiers qu'on n'y avait pas inscrits n'étaient surveillés par rien.
    #
    # Trois angles complémentaires, parce qu'aucun ne suffit :
    #   1. un littéral ACCENTUÉ (le français de ce site l'est presque partout) ;
    #   2. un littéral dans un attribut ou une prop QUI PORTE DU TEXTE ;
    #   3. un NŒUD DE TEXTE JSX.
    # Le premier seul ne voyait ni « + Acte », ni « Personnages », ni « Date » ; les
    # deux autres seuls ne voient pas un texte rangé dans une variable. Ensemble ils
    # attrapent tout ce que la traduction avait oublié (vérifié en rejouant les
    # trois sur l'arbre d'avant : 160 relevés, zéro après).

    # Littéraux accentués légitimes, avec leur motif. Toute addition ici est un
    # acte : elle dit « ce texte ne se traduit pas ».
    ACCENT_ALLOWED = {
        # Le nom d'une langue s'écrit DANS cette langue et ne se traduit jamais :
        # « Français » reste « Français » dans l'UI anglaise, parce qu'on cherche
        # sa langue avec son propre mot pour elle (LocaleSwitch.jsx).
        "Français",
        # Les guillemets par locale de `makeFormats` : c'est de la donnée de
        # locale, pas du texte d'interface, et i18n.js est justement l'endroit qui
        # porte celle des deux langues (Intl n'expose pas celles de CLDR).
        "«\u00a0",
        "\u00a0»",
    }

    # Les attributs HTML et les props de composant qui PORTENT DU TEXTE sur ce
    # site. Un littéral y est forcément un texte d'interface : il n'y a rien
    # d'autre à écrire dans un `title`. La liste est celle du dépôt, donc une prop
    # de texte ajoutée à un composant partagé s'inscrit ici.
    TEXT_ATTRS = (
        "title",
        "aria-label",
        "aria-valuetext",
        "placeholder",
        "alt",
        "label",
        "hint",
        "error",
        "unit",
        "confirmLabel",
        "primaryLabel",
        "saveLabel",
    )

    # Deux littéraux qui ne sont pas du texte d'interface : un nom de fichier et
    # la marque. Ni l'un ni l'autre ne se traduit.
    NOT_TEXT = {"script.json", "PrettyDrama"}

    # Les mots-clés JS en tête de ligne : un `return` ou un `else` tombé entre un
    # `>` et un `<` de comparaison n'est pas un nœud de texte.
    JS_KEYWORDS = {
        "return", "else", "if", "const", "let", "var", "for", "while", "break",
        "continue", "try", "catch", "finally", "default", "case", "throw", "new",
        "await", "async", "function", "export", "import", "delete", "typeof",
        "in", "of", "do", "switch", "class", "extends", "yield", "void",
    }

    ACCENTED = re.compile(r"[àâäçéèêëîïôöùûüÀÂÄÇÉÈÊËÎÏÔÖÙÛÜœæ«»]")
    # Deux minuscules d'affilée : ce qui distingue un mot d'un acronyme technique
    # (« (ZIP) », « (PDF) ») ou d'un symbole (« ✕ », « ⠿ »), qui restent en clair.
    HAS_WORD = re.compile(r"[a-zà-ÿ]{2,}")
    # Le contenu d'une interpolation n'est pas du littéral : `${scene.act}` est
    # déjà un libellé traduit, il ne doit pas faire relever son propre nom.
    INTERPOLATION = re.compile(r"\$\{[^}]*\}")
    # Les caractères qui trahissent du code dans un nœud de texte candidat.
    CODE_CHARS = set("={}()[];\"'`&|$#\\/*<>@,")

    def test_no_accented_literal_survives_outside_the_catalogues(self):
        # Grossier mais efficace, et c'est le seul des trois qui voie un texte
        # rangé dans une variable ou un tableau.
        offenders = []
        for path in self.scanned_files():
            relative = path.relative_to(REPO_ROOT).as_posix()
            # Sans les commentaires : il en reste beaucoup en français, et un
            # commentaire n'est pas un texte affiché.
            source = js_without_comments(read(path))
            for quoted in re.findall(r'"([^"\n]*)"|\'([^\'\n]*)\'', source):
                text = quoted[0] or quoted[1]
                if text in self.ACCENT_ALLOWED:
                    continue
                if self.ACCENTED.search(text):
                    offenders.append(f"{relative} : {text[:60]}")
        self.assertEqual(
            offenders,
            [],
            "Un littéral français vit hors des catalogues : il ne se traduira "
            "jamais. Déplacer dans src/shared/locales/, ou l'inscrire dans "
            "ACCENT_ALLOWED avec son motif. " + " ; ".join(offenders),
        )

    def test_no_text_bearing_attribute_carries_a_literal(self):
        # Le garde qui voit le français SANS accent, celui que le précédent ne
        # pouvait pas voir : « Renommer », « Pause », « Mot entier ».
        pattern = re.compile(
            r"\b(" + "|".join(self.TEXT_ATTRS) + r')=\{?\s*(["\'`])(.*?)(?<!\\)\2', re.S
        )
        offenders = []
        for path in self.scanned_files():
            relative = path.relative_to(REPO_ROOT).as_posix()
            source = js_without_comments(read(path))
            for match in pattern.finditer(source):
                text = self.INTERPOLATION.sub("", match.group(3)).strip()
                if not text or text in self.NOT_TEXT:
                    continue
                if self.HAS_WORD.search(text):
                    offenders.append(f"{relative} : {match.group(1)}=« {text[:50]} »")
        self.assertEqual(
            offenders,
            [],
            "Un attribut qui porte du texte reçoit un littéral : il ne se "
            "traduira jamais. Passer par t(). " + " ; ".join(offenders),
        )

    def test_no_jsx_text_node_carries_a_literal(self):
        """L'autre moitié du garde sans accent : le texte écrit entre deux balises.

        Heuristique, et bornée exprès aux lignes qui ressemblent à de la prose (au
        moins deux mots, ou une capitale initiale, ou un accent) et qui ne portent
        aucun caractère de code. Elle ne voit donc pas un texte adjacent à une
        accolade sur la même ligne, ce que seul un vrai analyseur JSX saurait
        découper ; c'est le premier garde qui rattrape ce cas dès que le texte est
        français. Ce qu'elle attrape, en revanche, elle l'attrape sans bruit.
        """
        offenders = []
        for path in self.scanned_files():
            relative = path.relative_to(REPO_ROOT).as_posix()
            source = js_without_comments(read(path))
            for match in re.finditer(r">([^<>]*?)<", source, re.S):
                for line in match.group(1).split("\n"):
                    text = line.strip()
                    if not text or text in self.NOT_TEXT:
                        continue
                    if self.CODE_CHARS & set(text):
                        continue
                    if self.HAS_WORD.search(text) and self.looks_like_prose(text):
                        offenders.append(f"{relative} : « {text[:50]} »")
        self.assertEqual(
            offenders,
            [],
            "Un nœud de texte JSX est écrit en clair : il ne se traduira jamais. "
            "Passer par t() ou par <T>. " + " ; ".join(offenders),
        )

    @classmethod
    def looks_like_prose(cls, text: str) -> bool:
        if text.split()[0] in cls.JS_KEYWORDS:
            return False
        # Plusieurs mots, une capitale initiale ou un accent : de quoi séparer
        # « + Acte », « Personnages » et « insérer » d'un identifiant tombé là
        # (`m.lineOrdinal`, `shiftEnter:`).
        return " " in text or text[0].isupper() or bool(re.search(r"[à-ÿÀ-Ý]", text))

    def test_every_page_key_has_its_label_and_desc(self):
        # `PAGES` ne porte plus les mots, donc rien dans le code ne relie une page
        # à ses deux textes : une page ajoutée sans eux afficherait sa clé.
        # Même esprit que TestPageSeals, qui fait ce lien pour les couleurs.
        page_keys = TestPageSeals.page_keys(self)
        missing = []
        for locale in ("fr", "en"):
            declared = self.catalogue_keys(locale)
            for page in sorted(page_keys):
                if f"page.{page}.label" not in declared:
                    missing.append(f"page.{page}.label ({locale})")
                # `home` est la seule page sans phrase de doc : elle n'a ni carte
                # d'accueil ni bandeau de pièce, donc rien qui la rendrait.
                if page != "home" and f"page.{page}.desc" not in declared:
                    missing.append(f"page.{page}.desc ({locale})")
        self.assertEqual(missing, [], "Textes de page manquants : " + ", ".join(missing))

    def test_no_entry_names_a_page_instead_of_interpolating_its_label(self):
        """Un libellé de page ne se recopie pas dans une phrase, il s'INTERPOLE.

        Six entrées de chaque catalogue nommaient la page Édition (« la pièce doit
        d'abord être saisie dans la page Édition ») : recopié, ce mot demandait
        douze retouches au moindre renommage, et les deux catalogues pouvaient
        dériver l'un de l'autre en silence. Ils passent maintenant par `{page}`,
        alimenté depuis `page.editor.label`.

        Le garde est volontairement BORNÉ au motif « page X » / « mode X », et pas
        à toute apparition du libellé : en français les noms de page sont des noms
        communs, donc « Enregistrement… » (la prise en cours), « Enregistrement »
        (l'étiquette du panneau) et « Avancement par personnage et par scène » sont
        trois emplois parfaitement légitimes qu'une recherche large relevait. Un
        garde qui demande une liste d'exemptions grandissant à chaque phrase n'aide
        personne ; celui-ci ne voit que la tournure qui DÉSIGNE une page, qui est
        exactement celle qu'on recopiait.
        """
        # « (dans la|de la|sur la) page Édition », « le mode Édition », « the
        # Editing page », « the Editing screen ».
        for locale, patterns in (
            ("fr", (r"\b(?:page|mode)\s+{label}\b",)),
            ("en", (r"\b{label}\s+(?:page|screen|mode)\b", r"\b(?:page|screen|mode)\s+{label}\b")),
        ):
            source = read(self.LOCALES_DIR / f"{locale}.js")
            labels = dict(re.findall(r'"page\.([a-z]+)\.label":\s*"([^"]+)"', source))
            self.assertTrue(labels, f"aucun libellé de page lu dans {locale}.js")
            offenders = []
            for key, text in re.findall(r'^  "([a-zA-Z0-9_.]+)":\s*(.*)$', source, re.MULTILINE):
                for page, label in labels.items():
                    if key == f"page.{page}.label":
                        continue
                    for pattern in patterns:
                        if re.search(pattern.format(label=re.escape(label)), text):
                            offenders.append(f"{locale} : {key} désigne la page « {label} »")
            self.assertEqual(
                offenders,
                [],
                "Une entrée désigne une page par son nom recopié au lieu de "
                "l'interpoler : passer par un paramètre alimenté par "
                "`t(pageLabelKey(...))`. " + " ; ".join(offenders),
            )

    def test_the_static_html_title_matches_the_french_catalogue(self):
        """Le `<title>` des .html est le repli AVANT exécution du JS (locale.js
        le repose ensuite). C'est donc du français en dur, qui doit rester en
        accord avec le catalogue : sinon un lecteur francophone voit le titre
        changer au chargement, ce que ce repli existe précisément pour éviter."""
        source = read(self.LOCALES_DIR / "fr.js")
        template = re.search(r'"common\.docTitle":\s*"([^"]+)"', source)
        self.assertIsNotNone(template, "common.docTitle introuvable dans fr.js")

        def label(key):
            found = re.search(rf'"{re.escape(key)}":\s*"([^"]+)"', source)
            self.assertIsNotNone(found, f"{key} absente de fr.js")
            return found.group(1)

        # Deux familles de documents, et c'est tout le découpage du site.
        #
        # Les GABARITS de `pages/` sont les sept pages d'une pièce, instanciées dans
        # le dossier de chaque pièce au build : leur libellé est celui de leur page
        # (`respo.html` est le seul à ne pas porter le nom de sa clé, c'est le second
        # accueil d'une pièce).
        #
        # Les deux `.html` de la RACINE vivent au-dessus des pièces (le sélecteur de la
        # troupe et la gestion des pièces du responsable) : ce ne sont pas des pages de
        # pièce, elles n'ont pas de clé `page.*` et leur libellé leur appartient.
        expected = {
            REPO_ROOT / "index.html": "chooser.label",
            REPO_ROOT / "respo.html": "manage.label",
        }
        for path in sorted((REPO_ROOT / "pages").glob("*.html")):
            page = {"index": "home", "respo": "respo"}.get(path.stem, path.stem)
            expected[path] = f"page.{page}.label"

        mismatches = []
        for path, key in sorted(expected.items()):
            want = template.group(1).replace("{page}", label(key))
            found = re.search(r"<title>([^<]*)</title>", read(path))
            self.assertIsNotNone(found, f"{path.name} : pas de <title>")
            if found.group(1) != want:
                where = path.relative_to(REPO_ROOT)
                mismatches.append(f"{where} : « {found.group(1)} » au lieu de « {want} »")
        self.assertEqual(
            mismatches,
            [],
            "Le <title> statique a dérivé du catalogue français : le titre "
            "changerait au chargement. " + " ; ".join(mismatches),
        )


class TestStructureLabels(unittest.TestCase):
    """Les libellés d'acte et de scène sont DÉRIVÉS de leur rang, et deux
    implémentations les dérivent : `structureLabels.js` pour l'écran, `STRUCTURE`
    de build_script_pdf.py pour le papier.

    Les faire diverger imprimerait « Acte II » sous un écran qui annonce
    « Act II », ou pire, décalerait la numérotation entre la page et le script
    qu'un acteur a en main. C'est le même genre de contrat que SAFE_ID et
    LINE_ID_PATTERN, et il se vérifie de la même façon : en lisant les deux
    sources.
    """

    LOCALES_DIR = SRC / "shared" / "locales"

    def js_template(self, locale: str, key: str) -> str:
        source = read(self.LOCALES_DIR / f"{locale}.js")
        found = re.search(rf'"{re.escape(key)}":\s*"([^"]+)"', source)
        self.assertIsNotNone(found, f"{key} introuvable dans {locale}.js")
        return found.group(1)

    def test_the_pdf_words_match_the_catalogues(self):
        # `{n}` côté JS, `%s` côté Python : c'est la seule différence permise.
        for locale, words in STRUCTURE.items():
            for kind, key in (("act", "structure.act"), ("scene", "structure.scene")):
                self.assertEqual(
                    words[kind].replace("%s", "{n}"),
                    self.js_template(locale, key),
                    f"{locale}/{kind} : le PDF et l'écran ne nommeraient pas pareil",
                )

    def test_both_sides_know_the_same_languages(self):
        js = set(re.findall(r'"([a-z]{2})"', re.search(
            r"export const LOCALES = \[(.*?)\];", read(SRC / "shared" / "i18n.js"), re.DOTALL
        ).group(1)))
        self.assertEqual(set(LANGUAGES), js, "LANGUAGES (Python) et LOCALES (JS) ont divergé")
        self.assertEqual(set(STRUCTURE), js, "STRUCTURE du PDF ne couvre pas toutes les langues")
        self.assertIn(DEFAULT_LANGUAGE, LANGUAGES)

    def test_the_roman_numerals_agree(self):
        """Les deux implémentations sont indépendantes, donc comparées valeur par
        valeur, y compris leur abandon au-delà de 39."""
        js = read(SRC / "shared" / "structureLabels.js")
        tens = re.search(r'const TENS = \[(.*?)\];', js, re.DOTALL).group(1)
        units = re.search(r'const UNITS = \[(.*?)\];', js, re.DOTALL).group(1)
        js_tens = re.findall(r'"([A-Z]*)"', tens)
        js_units = re.findall(r'"([A-Z]*)"', units)
        self.assertEqual(js_tens, list(_TENS), "les dizaines romaines ont divergé")
        self.assertEqual(js_units, list(_UNITS), "les unités romaines ont divergé")
        # Et le comportement, sur toute la plage utile plus ses bords.
        expected = {1: "I", 4: "IV", 9: "IX", 10: "X", 14: "XIV", 39: "XXXIX", 40: "40", 0: "0"}
        for n, want in expected.items():
            self.assertEqual(roman_numeral(n), want, f"roman_numeral({n})")

    def test_no_act_or_scene_title_is_written_back_into_the_play(self):
        """Aucun script publié ne doit porter de titre d'acte ni de scène : ce
        serait une donnée dans une langue, et elle repartirait vers le PDF, les
        colonnes de l'Avancement et la portée de la Répartition."""
        for play_id, script in published_scripts():
            self.assertIn(
                script.get("language"), LANGUAGES, f"{play_id} : la pièce doit dire sa langue"
            )
            for ai, act in enumerate(script.get("acts", [])):
                self.assertNotIn("title", act, f"{play_id}, acte {ai}")
                for si, scene in enumerate(act.get("scenes", [])):
                    self.assertNotIn("title", scene, f"{play_id}, acte {ai}, scène {si}")


class TestPublishedPlays(unittest.TestCase):
    """Les pièces réellement présentes dans le dépôt, contre la disposition que le
    site et l'Action attendent d'elles. Ce n'est pas un test de comportement mais un
    garde-fou d'ARBRE : une pièce mal rangée ne se voit pas en relisant du code, elle
    se voit quand une page rend un 404 chez la troupe."""

    def test_no_play_script_claims_another_play_than_its_own_folder(self):
        """Un script qui nomme une AUTRE pièce que son dossier ferait refuser tous les
        dépôts de la pièce (`validate_script` compare les deux), donc le garde-fou se
        retournerait contre la troupe.

        Il ne demande PAS que l'identifiant soit présent, et cet écart est
        délibéré : `validate_script` accepte un script qui n'en porte pas (c'est le cas
        d'un fichier téléchargé avant que ce champ existe, et le dossier décide alors
        seul). Exiger la présence ici rendrait la CI rouge pour un dépôt que l'Action
        accepte, donc arrêterait le déploiement du site sur un fichier parfaitement
        utilisable, et ce silence est exactement ce que le projet redoute le plus."""
        for play_id, script in published_scripts():
            declared = script.get("id")
            if not declared:
                continue
            self.assertEqual(
                declared,
                play_id,
                f"plays/{play_id}/data/script.json déclare l'identifiant "
                f"{declared!r} : ses dépôts seraient tous refusés.",
            )

    def test_every_play_has_a_deposit_zone(self):
        """Elle doit EXISTER dans le dépôt avant que le respo clique le bouton de
        dépôt de la pièce : GitHub ne sert sa page d'envoi que sur un dossier qu'il
        connaît, et git ne versionne pas un dossier vide, d'où le `.gitkeep`."""
        for play_id in play_ids():
            zone = REPO_ROOT / "uploads" / play_id
            self.assertTrue(zone.is_dir(), f"uploads/{play_id}/ manque")
            self.assertTrue((zone / ".gitkeep").exists(), f"uploads/{play_id}/.gitkeep manque")


if __name__ == "__main__":
    unittest.main()
