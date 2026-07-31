"""Contracts that two files must hold TOGETHER, checked by CI.

The project has several of them, which used to live only in a "keep in sync"
comment. A comment does not break CI: it gets read once, then goes stale in
silence, and the breakage lands months later at a theatre company.

These tests therefore do not check a behaviour but a CONSISTENCY between
files, and they are deliberately written by reading the sources rather than by
copying the expected values (copying would only move the problem elsewhere).

They run with the rest of the Python suite, so in build.yml, so on every code
push as well as after every deposit.
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
from common import (
    MAX_PLAY_ID_LENGTH,
    PLAY_ID_PATTERN,
    REPO_ROOT,
    is_play_id,
    mint_play_id,
    new_play_script,
    play_data_dir,
    play_ids,
)
from process_uploads import LINE_ID_PATTERN, NEW_PLAY_DIR, TITLE_SEPARATOR

SRC = REPO_ROOT / "src"
THEME_CSS = SRC / "shared" / "theme.css"
PAGES_JS = SRC / "shared" / "pages.js"
# The templates for the seven pages of a play, instantiated in each play's
# folder at build time (cf. vite.config.js).
PAGES_DIR = REPO_ROOT / "pages"
PLAYS_JS = SRC / "shared" / "plays.js"
REDUCER_JS = SRC / "editor" / "reducer.js"
# The two sides of the ZIP contract: the page that writes the archive and the script
# that reads it back.
RECORDER_JSX = SRC / "recorder" / "App.jsx"
PROCESS_UPLOADS_PY = REPO_ROOT / "scripts" / "process_uploads.py"
CHARACTER_COLORS_JS = SRC / "shared" / "characterColors.js"

# Tokens that a shared header rule must not consume: each one is re-skinned
# somewhere, so the header would no longer render the same way from one page to
# the next. `--accent`, `--font-serif` and `--shadow` are re-skinned by the
# editor ("Rail" direction); `--page-mark` and `--page-mark-soft` are re-skinned
# by EVERY page, via the `page-<key>` class both headers put on their root.
FORBIDDEN_IN_HEADER = (
    "--accent",
    "--font-serif",
    "--shadow",
    "--page-mark",
    "--page-mark-soft",
)

# A single exception, and it is deliberate: the link back to the home page. It
# is the FOOT of the header it closes, so it wears that header's colour, badge,
# word, hover wash and focus ring together: the navy of Progress, the purple of
# Editing, the wine of the four other pages. It carries `page-${page}` itself
# (HomeLink.jsx) and what says "home" there is the drawing of the two masks, not
# the hue. This guard only reads CSS and cannot see that class set in JSX: the
# exemption is therefore written here, which stands as a decision. It covers ONLY
# the seal tokens.
HEADER_TOKEN_EXEMPT_PREFIX = ".play-header-home"
EXEMPT_TOKENS = ("--page-mark", "--page-mark-soft")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def published_scripts():
    """(id, script) for every play in the repo that carries a readable script.

    The guards that use it inspect the real TREE and not code: they therefore hold
    for every play at once, with no list to maintain, and a play added tomorrow
    enters on its own. A play without a script is skipped: the folder can be born
    of a refused deposit, and it is its journal that tells the story."""
    for play_id in play_ids():
        path = play_data_dir(play_id) / "script.json"
        if path.exists():
            yield play_id, json.loads(read(path))


def css(path: Path) -> str:
    """CSS without its comments: this file is heavily commented, and a comment
    that quotes a token or a class is not a declaration."""
    return re.sub(r"/\*.*?\*/", "", read(path), flags=re.DOTALL)


def js_without_comments(source: str) -> str:
    """JS without its comments, skipping over strings.

    A `re.sub` was enough for the CSS, not here: this repo comments a great deal,
    and its comments QUOTE code (T.jsx documents `<T k="key" …>`, which made the
    scan pick up a "key" key that does not exist). Conversely, splitting naively
    on `//` would cut in the middle of a URL inside a string.

    Known and accepted limitation: a regular expression containing a quote would
    be taken for the start of a string. No source in the repo has one, and the
    only effect would be a partial scan, never a false positive.
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
    """Line ids name the mp3 files. The browser mints them and validates them
    (SAFE_ID), the Action revalidates them on arrival (LINE_ID_PATTERN). The two
    guards must say EXACTLY the same thing: stricter on the Action side, an actor
    would see their ZIP refused over ids the editor handed them; more permissive,
    a hostile id would name a file."""

    def test_safe_id_and_line_id_pattern_are_the_same_expression(self):
        match = re.search(r"export const SAFE_ID = /(.+?)/;", read(REDUCER_JS))
        self.assertIsNotNone(match, "SAFE_ID not found in src/editor/reducer.js")
        self.assertEqual(
            match.group(1),
            LINE_ID_PATTERN.pattern,
            "SAFE_ID (src/editor/reducer.js) and LINE_ID_PATTERN "
            "(scripts/process_uploads.py) have diverged: they name the same "
            "mp3 files and must stay identical down to the character.",
        )

    def test_the_pattern_stays_anchored_and_bounded(self):
        # Anchored at both ends (otherwise "../x-1" would slip through the
        # middle) and bounded (an id names a file).
        pattern = LINE_ID_PATTERN.pattern
        self.assertTrue(pattern.startswith("^"))
        self.assertTrue(pattern.endswith("$"))
        self.assertIn("{1,", pattern)


class TestPlayIdPattern(unittest.TestCase):
    """A play's id names a FOLDER of the repo (`plays/<id>/`, `uploads/<id>/`)
    and a URL segment of the published site. The browser mints it and validates it
    (SAFE_PLAY_ID), the Action revalidates it before turning it into a path
    (PLAY_ID_PATTERN). Same contract as line ids, with one detail that matters:
    where a line id names a file, this one names a folder that a deposited file
    points at, so letting them diverge would refuse a deposit over an id the site
    itself just wrote."""

    def test_safe_play_id_and_play_id_pattern_are_the_same_expression(self):
        match = re.search(r"export const SAFE_PLAY_ID = /(.+?)/;", read(PLAYS_JS))
        self.assertIsNotNone(match, "SAFE_PLAY_ID not found in src/shared/plays.js")
        self.assertEqual(
            match.group(1),
            PLAY_ID_PATTERN.pattern,
            "SAFE_PLAY_ID (src/shared/plays.js) and PLAY_ID_PATTERN "
            "(scripts/common.py) have diverged: they name the same folders and "
            "must stay identical down to the character.",
        )

    def test_the_pattern_stays_anchored_and_bounded(self):
        pattern = PLAY_ID_PATTERN.pattern
        self.assertTrue(pattern.startswith("^"))
        self.assertTrue(pattern.endswith("$"))
        self.assertIn("{0,", pattern)

    def test_the_pattern_accepts_what_slugify_produces(self):
        # `slugify` (src/shared/data.js) is what mints the id: lowercase letters,
        # digits and hyphens, with no hyphen at either end. This guard stands as a
        # record that the pattern does not refuse the output of the only function
        # that feeds it.
        for good in ("transport-de-femmes", "le-malade-imaginaire", "piece2", "a"):
            self.assertIsNotNone(PLAY_ID_PATTERN.fullmatch(good), good)
        for bad in ("-tiret-en-tete", "Majuscule", "avec espace", "accentué", "a" * 65, ""):
            self.assertIsNone(PLAY_ID_PATTERN.fullmatch(bad), bad)


class TestPlayIdMinting(unittest.TestCase):
    """A play is created by uploading its TITLE, and the identifier is derived from it
    on arrival (`mint_play_id`). The management page derives the same one beforehand
    (`mintPlayId`, src/shared/plays.js) so as to announce the address and refuse a
    duplicate on the spot.

    Two implementations, therefore, and this is the one contract of the project whose
    breakage nobody would see: the page would announce one address, the Action would
    create another, and the play would simply appear where nobody was told to look. They
    are held together by a shared table of cases, read here and by
    src/shared/plays.test.js: a case is written once and checked on both sides."""

    CASES_PATH = REPO_ROOT / "scripts" / "tests" / "play-id-cases.json"

    def cases(self) -> list[dict]:
        return json.loads(read(self.CASES_PATH))

    def test_the_shared_table_is_read_and_covers_more_than_the_easy_cases(self):
        # A guard that would pass on an empty table guards nothing, and this one is the
        # whole contract.
        cases = self.cases()
        self.assertGreater(len(cases), 5, "shared table not read")
        self.assertTrue(any(case["id"] == "" for case in cases), "no unusable title")
        self.assertTrue(
            any(len(case["id"]) == MAX_PLAY_ID_LENGTH for case in cases), "no truncated title"
        )

    def test_the_action_mints_what_the_page_announced(self):
        for case in self.cases():
            with self.subTest(case["name"]):
                self.assertEqual(mint_play_id(case["title"]), case["id"])

    def test_the_shared_table_is_read_by_the_front_test_too(self):
        """Half a contract is worse than none: this table only holds the two sides
        together if the JS suite reads it as well, and it is one deletion away from
        being Python-only."""
        source = read(SRC / "shared" / "plays.test.js")
        self.assertIn(self.CASES_PATH.name, source)

    def test_every_minted_identifier_is_accepted_by_the_pattern(self):
        # The identifier becomes a folder and a URL segment: minting one the pattern
        # refuses would create the play and then refuse all of its uploads.
        for case in self.cases():
            if case["id"] == "":
                continue
            with self.subTest(case["name"]):
                self.assertTrue(is_play_id(mint_play_id(case["title"])))

    def test_a_non_string_title_mints_nothing(self):
        # `read_title` only ever hands over text, but this function names folders: it
        # answers "no address" rather than raising, on this side as on the other.
        for bad in (None, 42, [], {}, b"Antigone"):
            self.assertEqual(mint_play_id(bad), "")


class TestCreationZone(unittest.TestCase):
    """`uploads/_new-play/` is the whole creation gesture: the site writes a file into it
    through GitHub's editor, and the Action reads everything that lands there as a play
    title, whatever the file is called.

    So the folder name is the ONE thing both sides must agree on, and nothing would report
    a disagreement: the file would be committed into a folder this pipeline does not scan,
    where it would sit for good with no play, no journal line and no error anywhere. Hence
    a guard, plus the one that keeps the name out of PLAY_ID_PATTERN: were it a valid play
    id, `main` would take the creation zone for a play of that name."""

    def js_zone(self) -> str:
        found = re.search(r'const NEW_PLAY_DIR = "([^"]+)";', read(SRC / "shared" / "data.js"))
        self.assertIsNotNone(found, "NEW_PLAY_DIR not found in src/shared/data.js")
        return found.group(1)

    def test_both_sides_name_the_same_folder(self):
        self.assertEqual(
            self.js_zone(),
            NEW_PLAY_DIR,
            "NEW_PLAY_DIR (src/shared/data.js) and NEW_PLAY_DIR "
            "(scripts/process_uploads.py) have diverged: the site would commit the file "
            "into a folder the Action does not read, and nothing would say so.",
        )

    def test_the_folder_can_never_be_a_play_id(self):
        self.assertIsNone(PLAY_ID_PATTERN.fullmatch(NEW_PLAY_DIR), NEW_PLAY_DIR)

    def js_separator(self) -> str:
        found = re.search(r'const TITLE_SEPARATOR = "([^"]+)";', read(SRC / "shared" / "data.js"))
        self.assertIsNotNone(found, "TITLE_SEPARATOR not found in src/shared/data.js")
        return found.group(1)

    def test_both_sides_agree_on_the_line_that_closes_the_title(self):
        """The site WRITES that line and the Action READS it: the title is what comes
        before it, the note for the coordinator is what follows.

        Diverged, the note would be read as part of the title and every creation would be
        refused for carrying several lines. Loud, unlike the folder name, but it is the
        site's only creation gesture that would stop working."""
        self.assertEqual(
            self.js_separator(),
            TITLE_SEPARATOR,
            "TITLE_SEPARATOR (src/shared/data.js) and TITLE_SEPARATOR "
            "(scripts/process_uploads.py) have diverged: the note the site writes into "
            "the file would be read as part of the play's title.",
        )

    def test_the_separator_is_not_a_title_anyone_could_type(self):
        # It is compared against a whole line, and a play titled exactly that leaves no
        # address anyway (`mint_play_id` folds it to nothing), so it can never be
        # swallowed by the cut.
        self.assertEqual(mint_play_id(TITLE_SEPARATOR), "")

    def test_the_site_writes_the_folder_into_the_url_it_opens(self):
        # The constant could exist and be used nowhere: what matters is that the path the
        # button opens really goes through it.
        source = js_without_comments(read(SRC / "shared" / "data.js"))
        self.assertIn("uploads/${NEW_PLAY_DIR}/", source)


class TestNewPlay(unittest.TestCase):
    """The empty play a creation upload brings into being (`new_play_script`,
    scripts/common.py) against the editor's fallback (`EMPTY_SCRIPT`,
    src/editor/reducer.js).

    It is the same document, written on both sides of the pipeline: a field added to one
    and not the other would give a play born without it, which the editor would then
    fill in silently, and the difference would only show up in a diff of script.json
    weeks later."""

    def empty_script_keys(self) -> set[str]:
        body = re.search(
            r"export const EMPTY_SCRIPT = \{(.*?)^\};", read(REDUCER_JS), re.DOTALL | re.MULTILINE
        )
        self.assertIsNotNone(body, "EMPTY_SCRIPT not found in src/editor/reducer.js")
        return set(re.findall(r"^  ([a-zA-Z]+):", body.group(1), re.MULTILINE))

    def test_a_created_play_has_exactly_the_fields_of_an_editor_play(self):
        keys = self.empty_script_keys()
        self.assertGreaterEqual(len(keys), 5, f"keys read: {keys}")
        self.assertEqual(set(new_play_script("antigone", "Antigone", "fr")), keys)

    def test_a_created_play_carries_its_identifier_its_title_and_its_language(self):
        fresh = new_play_script("antigone", "Antigone", "en")
        self.assertEqual(fresh["id"], "antigone")
        self.assertEqual(fresh["title"], "Antigone")
        self.assertEqual(fresh["language"], "en")

    def test_a_created_play_carries_a_scene_to_write_in(self):
        # The structural floor the editor lays down too: without a scene, the first
        # opening of the Editing page would have nothing to display.
        fresh = new_play_script("antigone", "Antigone", "fr")
        self.assertEqual(fresh["acts"], [{"scenes": [{"lines": []}]}])
        self.assertEqual(fresh["characters"], [])


class TestCharacterPalette(unittest.TestCase):
    """A character's colour is written by the editor (JS palette) and copied by
    the Action all the way to the manifest (COLOR_PATTERN). The palette has only
    one implementation, in JS, and the Python side validates only its FORM: this
    guard checks that the accepted form does cover the whole palette.

    Without it, adding a colour written some other way ("#FFF", a CSS name, an
    `oklch()`) would silently drop it from the manifest, and the Speaking share
    page would colour that character like a character with no colour."""

    def palette(self) -> list[str]:
        body = re.search(
            r"export const CHARACTER_COLORS = \[(.*?)^\];",
            read(CHARACTER_COLORS_JS),
            re.DOTALL | re.MULTILINE,
        )
        self.assertIsNotNone(body, "CHARACTER_COLORS not found in characterColors.js")
        return re.findall(r'"(#[0-9a-fA-F]+)"', body.group(1))

    def test_the_palette_is_found_and_has_its_twenty_colours(self):
        # A guard that would pass on an empty list guards nothing. Twenty, because
        # it is Tableau 10 then the ten light shades of tab20.
        palette = self.palette()
        self.assertEqual(len(palette), 20, f"palette read: {palette}")
        self.assertEqual(len(set(palette)), 20, "two characters cannot share the same colour")

    def test_every_palette_colour_survives_the_python_validation(self):
        for color in self.palette():
            self.assertIsNotNone(
                COLOR_PATTERN.match(color),
                f"{color} (src/shared/characterColors.js) is refused by "
                f"COLOR_PATTERN (scripts/build_manifest.py), so it would not "
                f"make it through the manifest.",
            )

    def test_the_python_validation_stays_anchored(self):
        # Without an end anchor, "#1f77b4; background: url(...)" would pass, and
        # the value ends up in a `style` attribute.
        self.assertTrue(COLOR_PATTERN.pattern.endswith(r"\Z"))


class TestReservedHeaderTokens(unittest.TestCase):
    """The shared header renders identically on every page, editor "Rail" re-skin
    included. That rests on a convention: the `--header-*` tokens are declared in
    theme.css and redefined nowhere.

    The list is not written here, it is READ from theme.css: a new reserved token
    is covered automatically."""

    def reserved_tokens(self) -> set[str]:
        root = re.search(r":root\s*\{(.*?)\}", css(THEME_CSS), re.DOTALL)
        self.assertIsNotNone(root, ":root not found in theme.css")
        return set(re.findall(r"(--header-[a-z-]+)\s*:", root.group(1)))

    def test_there_are_reserved_tokens_to_guard(self):
        # If the convention disappeared, this test would fail instead of passing
        # on an empty set (a guard that guards nothing is worse than nothing).
        self.assertGreaterEqual(len(self.reserved_tokens()), 3)

    def test_no_page_css_redefines_them(self):
        reserved = self.reserved_tokens()
        offenders = []
        for page_css in sorted(SRC.rglob("*.css")):
            if page_css == THEME_CSS:
                continue
            for token in reserved:
                if re.search(rf"{re.escape(token)}\s*:", css(page_css)):
                    offenders.append(f"{page_css.relative_to(REPO_ROOT)} redefines {token}")
        self.assertEqual(
            offenders,
            [],
            "A token reserved for the shared header is redefined by a page: "
            "the header would no longer render the same from one screen to the "
            "next. " + " ; ".join(offenders),
        )

    def test_the_shared_header_never_consumes_a_reskinnable_token_for_its_identity(self):
        # The header's identity (brand ink, title serif, shadow) must go through
        # the reserved tokens. The watched tokens are re-skinned by one page or
        # another: seeing them here would mean the header changes appearance
        # depending on the page.
        theme = css(THEME_CSS)
        # Leading indentation is tolerated on both sides of the rule: without it,
        # the guard only saw top-level rules and let through everything living in
        # an `@media`, which is exactly where the header keeps its mobile rules
        # (seal size, drawing of the home logo).
        header_rules = re.findall(
            r"^[ \t]*(\.page-header[^{]*|\.play-header[^{]*)\{(.*?)^[ \t]*\}",
            theme,
            re.DOTALL | re.MULTILINE,
        )
        self.assertGreater(len(header_rules), 0, "no header rule found")
        leaks = []
        for selector, body in header_rules:
            exempt = selector.strip().startswith(HEADER_TOKEN_EXEMPT_PREFIX)
            for token in FORBIDDEN_IN_HEADER:
                if exempt and token in EXEMPT_TOKENS:
                    continue
                # var(--shadow) must not be confused with var(--shadow-hover),
                # nor var(--page-mark) with var(--page-mark-soft): the closing
                # parenthesis makes the difference.
                if re.search(rf"var\(\s*{re.escape(token)}\s*\)", body):
                    leaks.append(f"{selector.strip()} consumes var({token})")
        self.assertEqual(
            leaks,
            [],
            "The shared header draws its identity from a token a page can "
            "re-skin; it needs a reserved token (--header-*). " + " ; ".join(leaks),
        )


class TestPageSeals(unittest.TestCase):
    """`PAGES` (pages.js) is the source of truth for the identity of the pages,
    but their COLOURS live in CSS (`.page-<key>` in theme.css). Nothing in the code
    links the two: a page added without its class would render a colourless seal,
    and nobody would see it before opening the page."""

    def page_keys(self) -> set[str]:
        body = re.search(r"export const PAGES = \{(.*?)^\};", read(PAGES_JS), re.DOTALL | re.MULTILINE)
        self.assertIsNotNone(body, "PAGES not found in src/shared/pages.js")
        return set(re.findall(r"^  ([a-zA-Z]+): \{", body.group(1), re.MULTILINE))

    def test_pages_are_found(self):
        self.assertGreaterEqual(len(self.page_keys()), 5)

    def seal_declarations(self) -> dict[str, set[str]]:
        """{page key: declared variables}, by reading the blocks of theme.css.

        The selectors are grouped (`.page-home, .page-rehearsal, …`), so we split
        each block's selector list rather than looking for each class one by
        one."""
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
                    missing.append(f"{key}: {variable} missing")
        self.assertEqual(
            missing,
            [],
            "A page does not have its complete seal in theme.css: its seal "
            "would render without colour. " + " ; ".join(missing),
        )

    def test_no_seal_colour_is_declared_for_a_page_that_does_not_exist(self):
        orphans = sorted(set(self.seal_declarations()) - self.page_keys())
        self.assertEqual(
            orphans,
            [],
            "theme.css colours a page that is absent from PAGES (page deleted?): "
            + ", ".join(orphans),
        )

    def seal_values(self) -> dict[str, dict[str, str]]:
        """{page key: {variable: hex}}, by reading theme.css as above."""
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
        """A page's favicon IS its seal badge: tile in `--page-mark-soft`, glyph
        in `--page-mark`, and `theme-color` in solid `--page-mark`. The hex values
        are necessarily copied there (a `<link>` tag does not read a CSS
        variable), so nothing prevented the favicon from keeping the colour of the
        page it was copied from: that is exactly what happens when a page is added
        by duplicating another one's `.html`, and it only shows up in the tab, or
        worse, in the thumbnail of the link the company shares around.

        The page <-> file correspondence goes through `PAGES[key].href`, the only
        source of truth for the link between the two."""
        pages_js = read(PAGES_JS)
        # {key: html file}, read from PAGES and not guessed from the name.
        hrefs = dict(
            re.findall(r"^  ([a-zA-Z]+): \{\s*\n\s*href: \"\./([a-z]+\.html)\"", pages_js, re.MULTILINE)
        )
        self.assertGreaterEqual(len(hrefs), 5, f"hrefs read: {hrefs}")
        values = self.seal_values()
        problems = []
        for key, filename in sorted(hrefs.items()):
            seal = values.get(key)
            if not seal:
                continue  # already covered by test_every_page_has_its_two_seal_colours
            html = read(PAGES_DIR / filename)
            # The two home pages share the favicon of the masks, whose inner fills
            # also take up the soft shade: we only check the PRESENCE of the two
            # hex values, not how many times they occur.
            icon = re.search(r'rel="icon" href="([^"]*)"', html)
            self.assertIsNotNone(icon, f"{filename} has no favicon")
            icon_href = icon.group(1).lower()
            for variable in ("--page-mark", "--page-mark-soft"):
                expected = seal[variable].lower().lstrip("#")
                if f"%23{expected}" not in icon_href:
                    problems.append(f"{filename}: the favicon does not use {variable} (#{expected})")
            theme = re.search(r'name="theme-color" content="(#[0-9a-fA-F]{6})"', html)
            self.assertIsNotNone(theme, f"{filename} has no theme-color")
            if theme.group(1).lower() != seal["--page-mark"].lower():
                problems.append(
                    f"{filename}: theme-color {theme.group(1)} instead of "
                    f"{seal['--page-mark']} (--page-mark of .page-{key})"
                )
        self.assertEqual(problems, [], "Favicon or theme-color out of tune with the seal. " + " ; ".join(problems))

    def test_every_page_has_its_apple_touch_icon(self):
        """iOS reads neither SVG favicons nor `data:` URIs: every page has its
        PNG, and an `href` pointing at a missing file lets iOS make up a thumbnail
        (a screenshot of the page, unreadable at that size)."""
        pages_js = read(PAGES_JS)
        hrefs = dict(
            re.findall(r"^  ([a-zA-Z]+): \{\s*\n\s*href: \"\./([a-z]+\.html)\"", pages_js, re.MULTILINE)
        )
        missing = []
        for key, filename in sorted(hrefs.items()):
            found = re.search(r'rel="apple-touch-icon"[^>]*href="/([^"]+)"', read(PAGES_DIR / filename))
            if not found:
                missing.append(f"{filename}: no apple-touch-icon")
            elif not (REPO_ROOT / "public" / found.group(1)).is_file():
                missing.append(f"{filename}: public/{found.group(1)} missing")
        self.assertEqual(missing, [], " ; ".join(missing))


class TestPageEntries(unittest.TestCase):
    """Every declared page must be a page that exists: a PAGES `href` with no
    template in `pages/` is a dead link in a home page or a header, and an entry
    in vite.config.js with no .html breaks the build."""

    def test_every_pages_href_points_to_a_real_html_file(self):
        hrefs = re.findall(r'href: "\./([a-z]+\.html)"', read(PAGES_JS))
        self.assertGreaterEqual(len(hrefs), 5)
        for href in hrefs:
            self.assertTrue((PAGES_DIR / href).is_file(), f"{href} declared in PAGES but missing")

    def test_every_root_html_is_a_vite_entry(self):
        """The two root `.html` files are the only entries written out plainly:
        the play selector and the play management page. One more without an entry
        would never be built nor deployed."""
        config = read(REPO_ROOT / "vite.config.js")
        entries = set(re.findall(r'resolve\(ROOT, "([a-z]+\.html)"\)', config))
        on_disk = {p.name for p in REPO_ROOT.glob("*.html")}
        self.assertEqual(
            entries,
            on_disk,
            "The root entries of vite.config.js and the root .html files have "
            "diverged: an entry with no file breaks the build, a file with no "
            "entry is never built nor deployed.",
        )

    def test_every_play_page_template_is_instantiated_by_the_build(self):
        """The seven pages of a play are TEMPLATES (`pages/*.html`), instantiated
        in each play's folder by vite.config.js. The list in the config and the
        templates on disk must coincide exactly: a template absent from the list
        would never be written, so the page would render a 404 for the company, and
        a name in the list with no template would fail the build of every play."""
        config = read(REPO_ROOT / "vite.config.js")
        declared = re.search(r"const PLAY_PAGES = \[([^\]]*)\]", config)
        self.assertIsNotNone(declared, "PLAY_PAGES not found in vite.config.js")
        listed = set(re.findall(r'"([a-z]+)"', declared.group(1)))
        on_disk = {p.stem for p in PAGES_DIR.glob("*.html")}
        self.assertEqual(
            listed,
            on_disk,
            "PLAY_PAGES (vite.config.js) and the templates in pages/ have diverged.",
        )

    def test_the_play_pages_cover_every_page_of_the_site(self):
        """And those templates are exactly the pages PAGES declares, plus the second
        home page: without this guard, a page added to PAGES could have a template
        for nobody, and its home cards would lead to a 404."""
        keys = set(re.findall(r"^  ([a-zA-Z]+): \{", read(PAGES_JS), re.MULTILINE))
        # `home` is a play's home page (`index.html`), `coordinator` its coordinator
        # twin, which is not a PAGES entry.
        expected = (keys - {"home"}) | {"index", "respo"}
        self.assertEqual(expected, {p.stem for p in PAGES_DIR.glob("*.html")})


class TestCatalogues(unittest.TestCase):
    """The i18n guards, and this is where the safety of the bilingual site is won.

    The project has NO component test at all, by choice (cf. CLAUDE.md), so
    nothing renders the pages to check their texts. Yet a rework of several
    hundred strings always breaks in two ways: a mistyped key, which shows up
    verbatim on screen, and a forgotten string, which stays in French in the
    English UI. The first two tests form a pincer around the former, the three
    text guards around the latter, by static reading, with no rendering and no
    dependency.

    Parity between the two catalogues is checked on the JS side
    (src/shared/locales/parity.test.js): it needs Intl.PluralRules, which Python
    does not have.
    """

    LOCALES_DIR = SRC / "shared" / "locales"

    def catalogue_keys(self, locale: str) -> set[str]:
        """The keys declared in a catalogue, read flat.

        We read the source rather than execute the JS: the Python CI has no JS
        engine, and the keys are `"a.b.c":` literals at the start of a line.
        """
        source = read(self.LOCALES_DIR / f"{locale}.js")
        return set(re.findall(r'^  "([a-zA-Z0-9_.]+)":', source, re.MULTILINE))

    def test_catalogues_are_found_and_not_empty(self):
        # Without this, every test below would pass on an empty set.
        for locale in ("fr", "en"):
            self.assertGreaterEqual(
                len(self.catalogue_keys(locale)), 10, f"catalogue {locale} not found or empty"
            )

    def scanned_files(self):
        """The front-end sources, excluding tests and catalogues."""
        for path in sorted(SRC.rglob("*.js*")):
            if path.name.endswith(".test.js") or path.parent == self.LOCALES_DIR:
                continue
            yield path

    def used_keys(self) -> dict[str, set[str]]:
        """{key used: {files}} for every key written out plainly in the code.

        A catalogue key travels by exactly two routes, and it is a convention that
        this scan makes enforceable:

        1. it is passed to `t(…)` or to `<T k="…">`, including in the middle of an
           expression (`t(canUndo ? "editor.undo.tip" : "editor.undo.none")`):
           hence the sweep of the WHOLE call with balanced parentheses, where a
           `t\\(\\s*"…"` only saw the first case;
        2. it lives in a table whose NAME says it holds keys
           (`CHARACTER_COLOR_KEYS`, `KIND_LABEL_KEY`), because the rank-by-rank
           pairing with colours or file types is checked where those values live,
           not in the JSX;
        3. it is the page label passed to `mountPage(…)`, which renders it into the
           document `<title>` (`applyDocumentLanguage`). The seven pages of a play
           pass a `page.<x>.label` key there, which the composed-key pattern
           already covered by accident; the two ROOT pages, however, have no
           `page.*` key (they are not play pages), and without this third route
           their labels read as orphan keys.

        One thing stays invisible here, and that is accepted: a key COMPOSED at
        runtime (`page.${page}.label`, `rail.${key}.tip`). Those are covered by
        pattern in `test_no_catalogue_key_is_declared_and_never_used`, and by
        `test_every_page_key_has_its_label_and_desc` for the pages.
        """
        used: dict[str, set[str]] = {}
        for path in self.scanned_files():
            # Without the comments: T.jsx documents its own usage with a sample
            # `<T k="key" …>`, which was picked up as a real key.
            source = js_without_comments(read(path))
            found = [
                key
                for callee in ("t", "mountPage")
                for call in self.balanced_calls(source, callee)
                # At least one dot: every catalogue key is dotted, and this sweep
                # also sees literals that are not keys
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
        """The contents of each `<callee>(…)`, with balanced parentheses: without
        this, an argument that itself contains a call (`t(pageLabelKey("editor"))`)
        or a condition (`t(canUndo ? "a" : "b")`) escaped the scan."""
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
        # THE guard that best replaces the missing component tests: a mistyped key
        # shows up verbatim on screen, and only a visit to the page concerned
        # would reveal it.
        used = self.used_keys()
        self.assertGreaterEqual(len(used), 5, "no call to t() found: has the scan broken?")
        missing = []
        for locale in ("fr", "en"):
            declared = self.catalogue_keys(locale)
            for key, files in sorted(used.items()):
                if key not in declared:
                    missing.append(f"{key} ({locale}) used in {', '.join(sorted(files))}")
        self.assertEqual(
            missing,
            [],
            "A key used in the code is in no catalogue: it will show up verbatim "
            "on screen. " + " ; ".join(missing),
        )

    def test_no_catalogue_key_is_declared_and_never_used(self):
        """The mirror guard of the previous one, and it proved itself on its own: a
        key written in both catalogues but never called signals a string we thought
        we had translated and that stayed hardcoded in the JSX (that is exactly
        what had happened to `common.loadingScript`, the editor keeping its literal
        "Chargement du script…").

        The "every key used exists" guard cannot see that case: it only looks one
        way."""
        used = set(self.used_keys())
        # Keys COMPOSED at runtime are invisible to the literal scan: we cover them
        # by pattern, which stands as a decision. Each one is built in a single
        # place, named here:
        #   page.<x>.label|desc      pageLabelKey / pageDescKey (pages.js)
        #   structure.language.<xx>  the LOCALES list (StructurePanel.jsx)
        #   rail.<x>[.tip]           the icon strip (EditorRail.jsx)
        #   recorder.status.<x>      a line's label (recorder/App.jsx)
        # `test_every_page_key_has_its_label_and_desc` checks the first ones
        # separately.
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
            "Key declared in the catalogues and never called: the corresponding "
            "string has probably stayed hardcoded in the JSX. "
            + ", ".join(orphans),
        )

    # ------------------------------------------------------------------------
    # The three "no forgotten string" guards. They watch ALL of `src/`, with no
    # list of files to maintain: a brand new page is therefore covered
    # automatically. It was the other way round during the translation (a MIGRATED
    # set that grew phase by phase, so as not to keep CI red for a whole worksite),
    # and that list is precisely what let five entire pages slip through: the files
    # not written into it were watched by nothing.
    #
    # Three complementary angles, because none of them is enough on its own:
    #   1. an ACCENTED literal (the French of this site is accented almost
    #      everywhere);
    #   2. a literal in an attribute or a prop THAT CARRIES TEXT;
    #   3. a JSX TEXT NODE.
    # The first one alone saw neither "+ Acte", nor "Personnages", nor "Date"; the
    # other two alone do not see a text tucked away in a variable. Together they
    # catch everything the translation had forgotten (verified by replaying all
    # three on the tree from before: 160 findings, zero afterwards).

    # Legitimate accented literals, with their reason. Any addition here is a
    # decision: it says "this text does not get translated".
    ACCENT_ALLOWED = {
        # A language's name is written IN that language and is never translated:
        # "Français" stays "Français" in the English UI, because you look for your
        # language using your own word for it (LocaleSwitch.jsx).
        "Français",
        # The per-locale quotation marks of `makeFormats`: that is locale DATA, not
        # interface text, and i18n.js is precisely the place that carries them for
        # both languages (Intl does not expose the CLDR ones).
        "«\u00a0",
        "\u00a0»",
    }

    # The HTML attributes and component props that CARRY TEXT on this site. A
    # literal in one of them is necessarily interface text: there is nothing else
    # to write in a `title`. The list is the repo's own, so a text prop added to a
    # shared component gets written in here.
    TEXT_ATTRS = (
        "title",
        "aria-label",
        "aria-valuetext",
        "placeholder",
        "alt",
        "label",
        "hint",
        "error",
        # The waiting sentence of `PageState`, a prop like the four below it: it
        # carries visible text, its default comes from the catalogue, and without it
        # here a literal passed by a page would slip through all three guards.
        "loading",
        "unit",
        "confirmLabel",
        "primaryLabel",
        "saveLabel",
    )

    # Two literals that are not interface text: a file name and the brand. Neither
    # of them gets translated.
    NOT_TEXT = {"script.json", "PrettyDrama"}

    # The JS keywords at the start of a line: a `return` or an `else` that fell
    # between a comparison `>` and `<` is not a text node.
    JS_KEYWORDS = {
        "return", "else", "if", "const", "let", "var", "for", "while", "break",
        "continue", "try", "catch", "finally", "default", "case", "throw", "new",
        "await", "async", "function", "export", "import", "delete", "typeof",
        "in", "of", "do", "switch", "class", "extends", "yield", "void",
    }

    ACCENTED = re.compile(r"[àâäçéèêëîïôöùûüÀÂÄÇÉÈÊËÎÏÔÖÙÛÜœæ«»]")
    # Two lowercase letters in a row: what tells a word apart from a technical
    # acronym ("(ZIP)", "(PDF)") or a symbol ("✕", "⠿"), which stay verbatim.
    HAS_WORD = re.compile(r"[a-zà-ÿ]{2,}")
    # The contents of an interpolation are not a literal: `${scene.act}` is already
    # a translated label, it must not get its own name reported.
    INTERPOLATION = re.compile(r"\$\{[^}]*\}")
    # The characters that betray code inside a candidate text node.
    CODE_CHARS = set("={}()[];\"'`&|$#\\/*<>@,")

    def test_no_accented_literal_survives_outside_the_catalogues(self):
        # Crude but effective, and it is the only one of the three that sees a text
        # tucked away in a variable or an array.
        offenders = []
        for path in self.scanned_files():
            relative = path.relative_to(REPO_ROOT).as_posix()
            # Without the comments: many of them are still in French, and a comment
            # is not a displayed text.
            source = js_without_comments(read(path))
            for quoted in re.findall(r'"([^"\n]*)"|\'([^\'\n]*)\'', source):
                text = quoted[0] or quoted[1]
                if text in self.ACCENT_ALLOWED:
                    continue
                if self.ACCENTED.search(text):
                    offenders.append(f"{relative}: {text[:60]}")
        self.assertEqual(
            offenders,
            [],
            "A French literal lives outside the catalogues: it will never be "
            "translated. Move it to src/shared/locales/, or write it into "
            "ACCENT_ALLOWED with its reason. " + " ; ".join(offenders),
        )

    def test_no_text_bearing_attribute_carries_a_literal(self):
        # The guard that sees French WITHOUT accents, the one the previous guard
        # could not see: "Renommer", "Pause", "Mot entier".
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
                    offenders.append(f"{relative}: {match.group(1)}='{text[:50]}'")
        self.assertEqual(
            offenders,
            [],
            "An attribute that carries text receives a literal: it will never be "
            "translated. Go through t(). " + " ; ".join(offenders),
        )

    def test_no_jsx_text_node_carries_a_literal(self):
        """The other half of the accent-free guard: the text written between two tags.

        Heuristic, and deliberately bounded to lines that look like prose (at least
        two words, or an initial capital, or an accent) and that carry no code
        character. It therefore does not see a text adjacent to a brace on the same
        line, which only a real JSX parser could split apart; it is the first guard
        that catches that case as soon as the text is French. What it does catch, on
        the other hand, it catches without noise.
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
                        offenders.append(f"{relative}: '{text[:50]}'")
        self.assertEqual(
            offenders,
            [],
            "A JSX text node is written out plainly: it will never be translated. "
            "Go through t() or through <T>. " + " ; ".join(offenders),
        )

    @classmethod
    def looks_like_prose(cls, text: str) -> bool:
        if text.split()[0] in cls.JS_KEYWORDS:
            return False
        # Several words, an initial capital or an accent: enough to tell
        # "+ Acte", "Personnages" and "insérer" apart from an identifier that
        # landed there (`m.lineOrdinal`, `shiftEnter:`).
        return " " in text or text[0].isupper() or bool(re.search(r"[à-ÿÀ-Ý]", text))

    def test_every_page_key_has_its_label_and_desc(self):
        # `PAGES` no longer carries the words, so nothing in the code links a page
        # to its two texts: a page added without them would display its key.
        # Same spirit as TestPageSeals, which makes that link for the colours.
        page_keys = TestPageSeals.page_keys(self)
        missing = []
        for locale in ("fr", "en"):
            declared = self.catalogue_keys(locale)
            for page in sorted(page_keys):
                if f"page.{page}.label" not in declared:
                    missing.append(f"page.{page}.label ({locale})")
                # `home` is the only page with no doc sentence: it has neither a
                # home card nor a play header, so nothing that would render it.
                if page != "home" and f"page.{page}.desc" not in declared:
                    missing.append(f"page.{page}.desc ({locale})")
        self.assertEqual(missing, [], "Missing page texts: " + ", ".join(missing))

    def test_no_entry_names_a_page_instead_of_interpolating_its_label(self):
        """A page label is not copied into a sentence, it is INTERPOLATED.

        Six entries of each catalogue named the Editing page ("la pièce doit
        d'abord être saisie dans la page Édition"): copied out, that word demanded
        twelve edits at the slightest rename, and the two catalogues could drift
        apart from one another in silence. They now go through `{page}`, fed from
        `page.editor.label`.

        The guard is deliberately BOUNDED to the "page X" / "mode X" turn of
        phrase, and not to every appearance of the label: in French, page names are
        common nouns, so "Enregistrement…" (the take in progress),
        "Enregistrement" (the panel's label) and "Avancement par personnage et par
        scène" are three perfectly legitimate uses that a broad search reported. A
        guard that demands a list of exemptions growing with every sentence helps
        nobody; this one only sees the turn of phrase that DESIGNATES a page, which
        is exactly the one that was being copied out.
        """
        # "(dans la|de la|sur la) page Édition", "le mode Édition", "the Editing
        # page", "the Editing screen".
        for locale, patterns in (
            ("fr", (r"\b(?:page|mode)\s+{label}\b",)),
            ("en", (r"\b{label}\s+(?:page|screen|mode)\b", r"\b(?:page|screen|mode)\s+{label}\b")),
        ):
            source = read(self.LOCALES_DIR / f"{locale}.js")
            labels = dict(re.findall(r'"page\.([a-z]+)\.label":\s*"([^"]+)"', source))
            self.assertTrue(labels, f"no page label read in {locale}.js")
            offenders = []
            for key, text in re.findall(r'^  "([a-zA-Z0-9_.]+)":\s*(.*)$', source, re.MULTILINE):
                for page, label in labels.items():
                    if key == f"page.{page}.label":
                        continue
                    for pattern in patterns:
                        if re.search(pattern.format(label=re.escape(label)), text):
                            offenders.append(f"{locale}: {key} designates the page '{label}'")
            self.assertEqual(
                offenders,
                [],
                "An entry designates a page by its copied-out name instead of "
                "interpolating it: go through a parameter fed by "
                "`t(pageLabelKey(...))`. " + " ; ".join(offenders),
            )

    def test_the_static_html_title_matches_the_french_catalogue(self):
        """The `<title>` of the .html files is the fallback BEFORE the JS runs
        (locale.js sets it again afterwards). It is therefore hardcoded French,
        which must stay in tune with the catalogue: otherwise a French-speaking
        reader sees the title change on load, which is exactly what this fallback
        exists to avoid."""
        source = read(self.LOCALES_DIR / "fr.js")
        template = re.search(r'"common\.docTitle":\s*"([^"]+)"', source)
        self.assertIsNotNone(template, "common.docTitle not found in fr.js")

        def label(key):
            found = re.search(rf'"{re.escape(key)}":\s*"([^"]+)"', source)
            self.assertIsNotNone(found, f"{key} missing from fr.js")
            return found.group(1)

        # Two families of documents, and that is the whole division of the site.
        #
        # The TEMPLATES in `pages/` are the seven pages of a play, instantiated in
        # each play's folder at build time: their label is that of their page
        # (`respo.html` is the only one not to bear the name of its key, it is a
        # play's second home page).
        #
        # The two ROOT `.html` files live above the plays (the company's selector and
        # the coordinator's play management page): they are not play pages, they have
        # no `page.*` key and their label belongs to them.
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
            self.assertIsNotNone(found, f"{path.name}: no <title>")
            if found.group(1) != want:
                where = path.relative_to(REPO_ROOT)
                mismatches.append(f"{where}: '{found.group(1)}' instead of '{want}'")
        self.assertEqual(
            mismatches,
            [],
            "The static <title> has drifted from the French catalogue: the title "
            "would change on load. " + " ; ".join(mismatches),
        )


class TestStructureLabels(unittest.TestCase):
    """Act and scene labels are DERIVED from their rank, and two implementations
    derive them: `structureLabels.js` for the screen, `STRUCTURE` in
    build_script_pdf.py for paper.

    Letting them diverge would print "Acte II" under a screen announcing
    "Act II", or worse, would offset the numbering between the page and the script
    an actor is holding. It is the same kind of contract as SAFE_ID and
    LINE_ID_PATTERN, and it is checked the same way: by reading both sources.
    """

    LOCALES_DIR = SRC / "shared" / "locales"

    def js_template(self, locale: str, key: str) -> str:
        source = read(self.LOCALES_DIR / f"{locale}.js")
        found = re.search(rf'"{re.escape(key)}":\s*"([^"]+)"', source)
        self.assertIsNotNone(found, f"{key} not found in {locale}.js")
        return found.group(1)

    def test_the_pdf_words_match_the_catalogues(self):
        # `{n}` on the JS side, `%s` on the Python side: that is the only difference
        # allowed.
        for locale, words in STRUCTURE.items():
            for kind, key in (("act", "structure.act"), ("scene", "structure.scene")):
                self.assertEqual(
                    words[kind].replace("%s", "{n}"),
                    self.js_template(locale, key),
                    f"{locale}/{kind}: the PDF and the screen would not name it the same way",
                )

    def test_both_sides_know_the_same_languages(self):
        js = set(re.findall(r'"([a-z]{2})"', re.search(
            r"export const LOCALES = \[(.*?)\];", read(SRC / "shared" / "i18n.js"), re.DOTALL
        ).group(1)))
        self.assertEqual(set(LANGUAGES), js, "LANGUAGES (Python) and LOCALES (JS) have diverged")
        self.assertEqual(set(STRUCTURE), js, "the PDF's STRUCTURE does not cover every language")
        self.assertIn(DEFAULT_LANGUAGE, LANGUAGES)

    def test_the_roman_numerals_agree(self):
        """The two implementations are independent, so they are compared value by
        value, including how they give up beyond 39."""
        js = read(SRC / "shared" / "structureLabels.js")
        tens = re.search(r'const TENS = \[(.*?)\];', js, re.DOTALL).group(1)
        units = re.search(r'const UNITS = \[(.*?)\];', js, re.DOTALL).group(1)
        js_tens = re.findall(r'"([A-Z]*)"', tens)
        js_units = re.findall(r'"([A-Z]*)"', units)
        self.assertEqual(js_tens, list(_TENS), "the Roman tens have diverged")
        self.assertEqual(js_units, list(_UNITS), "the Roman units have diverged")
        # And the behaviour, over the whole useful range plus its edges.
        expected = {1: "I", 4: "IV", 9: "IX", 10: "X", 14: "XIV", 39: "XXXIX", 40: "40", 0: "0"}
        for n, want in expected.items():
            self.assertEqual(roman_numeral(n), want, f"roman_numeral({n})")

    def test_no_act_or_scene_title_is_written_back_into_the_play(self):
        """No published script must carry an act or scene title: it would be a
        piece of data in one language, and it would travel back out to the PDF, the
        Progress columns and the Speaking share scope."""
        for play_id, script in published_scripts():
            self.assertIn(
                script.get("language"), LANGUAGES, f"{play_id}: the play must state its language"
            )
            for ai, act in enumerate(script.get("acts", [])):
                self.assertNotIn("title", act, f"{play_id}, act {ai}")
                for si, scene in enumerate(act.get("scenes", [])):
                    self.assertNotIn("title", scene, f"{play_id}, act {ai}, scene {si}")


class TestZipFormat(unittest.TestCase):
    """The ZIP of takes, written by the Recording page and read by the Action.

    The one contract of this project whose two sides can never be checked by running
    them together: the archive is built in a browser and opened in a workflow, weeks
    apart, by way of a company's mailbox. Nothing fails when they fall out of step,
    the Action simply refuses every ZIP an actor sends, with a format message, and the
    company has no idea why. CLAUDE.md has been advertising this guard among the
    cross-file contracts; it did not exist, and the format has just gained a field.

    Read on BOTH sides, like every test in this file, and deliberately loose about
    everything but the shape: the point is that a key added on one side gets added on
    the other, not to freeze the way either one is written.
    """

    def manifest_keys_written(self) -> set:
        """The keys the Recording page puts in manifest.json."""
        source = js_without_comments(read(RECORDER_JSX))
        found = re.search(
            r'zip\.file\(\s*"manifest\.json"\s*,\s*JSON\.stringify\(\s*\{(.*?)\}', source, re.S
        )
        self.assertIsNotNone(found, "the call writing manifest.json is no longer recognisable")
        # `{ play: manifest.id, clips }`: one entry per comma, and of each entry only
        # the NAME, which is what precedes the colon (or the whole of it, for the
        # shorthand). Reading the names with a bare `\w+` would also collect the
        # `id` of the `manifest.id` on the value side.
        keys = set()
        for entry in found.group(1).split(","):
            name = entry.split(":")[0].strip()
            if name:
                keys.add(name)
        return keys

    def manifest_keys_read(self) -> set:
        """The keys `parse_manifest` looks for in it."""
        source = read(PROCESS_UPLOADS_PY)
        body = source[source.index("def parse_manifest") : source.index("def process_zip")]
        # The two ways it names a key: `manifest.get("x")` and `"x" in manifest`.
        pairs = re.findall(r'manifest\.get\("(\w+)"|"(\w+)" in manifest', body)
        return {name for pair in pairs for name in pair if name}

    def test_the_two_sides_name_the_same_manifest_keys(self):
        written = self.manifest_keys_written()
        read_back = self.manifest_keys_read()
        self.assertEqual(
            written,
            read_back,
            f"the Recording page writes {sorted(written)} into manifest.json while "
            f"parse_manifest reads {sorted(read_back)}: every ZIP an actor sends would "
            "be refused for a format reason, and nothing would say why.",
        )

    def test_the_audio_member_is_named_after_the_line_id(self):
        """`{lineId}.{ext}`, and the extension is the recording browser's, which is why
        the Action looks the member up by id rather than by name."""
        written = js_without_comments(read(RECORDER_JSX))
        # `assertRegex` on a whole file prints the whole file when it fails: we test
        # the search ourselves so a drift reads as one sentence.
        self.assertTrue(
            re.search(r"zip\.file\(\s*`\$\{lineId\}\.\$\{take\.ext\}`", written),
            "recorder/App.jsx no longer names the audio member {lineId}.{ext}: the "
            "Action looks it up by id and would find nothing.",
        )
        source = read(PROCESS_UPLOADS_PY)
        body = source[source.index("def parse_manifest") : source.index("def process_zip")]
        # The Action rebuilds that same name from the id alone, the extension being
        # whatever the browser chose: an alphanumeric run after the dot.
        self.assertIn("re.escape(line_id)", body)
        self.assertRegex(body, r'r"\\\.\[0-9a-zA-Z\]\+"')

    def test_the_play_id_travels_verbatim_from_the_manifest(self):
        """The field is a VERIFICATION and never a routing (the upload folder routes),
        so what the page writes must be the play's own id, taken from the manifest it
        is displaying, and nothing recomputed."""
        source = js_without_comments(read(RECORDER_JSX))
        self.assertTrue(
            re.search(r"play:\s*manifest\.id", source),
            "recorder/App.jsx no longer writes the play id straight from the manifest.",
        )


class TestPublishedPlays(unittest.TestCase):
    """The plays actually present in the repo, against the layout the site and the
    Action expect of them. This is not a behaviour test but a TREE safeguard: a
    badly filed play does not show up when rereading code, it shows up when a page
    renders a 404 for the company."""

    def test_no_play_script_claims_another_play_than_its_own_folder(self):
        """A script that names a play OTHER than its folder would make every deposit
        of that play be refused (`validate_script` compares the two), so the
        safeguard would turn against the company.

        It does NOT require the id to be present, and that gap is deliberate:
        `validate_script` accepts a script that does not carry one (that is the case
        for a file downloaded before this field existed, and the folder then decides
        on its own). Requiring its presence here would turn CI red for a deposit the
        Action accepts, so it would stop the site's deployment over a perfectly
        usable file, and that silence is exactly what the project dreads most."""
        for play_id, script in published_scripts():
            declared = script.get("id")
            if not declared:
                continue
            self.assertEqual(
                declared,
                play_id,
                f"plays/{play_id}/data/script.json declares the id "
                f"{declared!r}: all of its deposits would be refused.",
            )

    def test_every_play_has_a_deposit_zone(self):
        """It must EXIST in the repo before the coordinator clicks the play's deposit
        button: GitHub only serves its upload page on a folder it knows about, and
        git does not version an empty folder, hence the `.gitkeep`."""
        for play_id in play_ids():
            zone = REPO_ROOT / "uploads" / play_id
            self.assertTrue(zone.is_dir(), f"uploads/{play_id}/ is missing")
            self.assertTrue((zone / ".gitkeep").exists(), f"uploads/{play_id}/.gitkeep is missing")


if __name__ == "__main__":
    unittest.main()
