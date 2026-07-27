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

from common import REPO_ROOT
from process_uploads import LINE_ID_PATTERN

SRC = REPO_ROOT / "src"
THEME_CSS = SRC / "shared" / "theme.css"
PAGES_JS = SRC / "shared" / "pages.js"
REDUCER_JS = SRC / "editor" / "reducer.js"


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
        # passer par les tokens réservés. --accent, --font-serif et --shadow
        # sont re-skinnés par l'éditeur : les voir ici voudrait dire que le
        # bandeau change d'aspect selon la page.
        theme = css(THEME_CSS)
        header_rules = re.findall(
            r"^(\.page-header[^{]*|\.play-header[^{]*)\{(.*?)^\}",
            theme,
            re.DOTALL | re.MULTILINE,
        )
        self.assertGreater(len(header_rules), 0, "aucune règle de bandeau trouvée")
        leaks = []
        for selector, body in header_rules:
            for token in ("--accent", "--font-serif", "--shadow"):
                # var(--shadow) ne doit pas être confondu avec var(--shadow-hover).
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
