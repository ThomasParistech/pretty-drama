"""Contracts two files must hold together, checked by READING both sources
rather than by copying expected values."""

from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_manifest import COLOR_PATTERN, DEFAULT_LANGUAGE, LANGUAGES
from build_script_pdf import STRUCTURE, _TENS, _UNITS, roman_numeral
from build_plays_index import listed_play_ids
from common import (
    DEV_PLAY_ID,
    MAX_PLAY_ID_LENGTH,
    PLAY_ID_PATTERN,
    REPO_ROOT,
    is_play_id,
    mint_play_id,
    new_play_script,
    play_data_dir,
    play_ids,
)
from process_uploads import (
    LINE_ID_PATTERN,
    NEW_PLAY_DIR,
    TITLE_SEPARATOR,
    UploadError,
    read_title,
)
from script_diff import script_changes

SRC = REPO_ROOT / "src"
TSCONFIG_PATH = REPO_ROOT / "tsconfig.json"
PACKAGE_JSON = REPO_ROOT / "package.json"
BUILD_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "build.yml"

# Nothing here is a source of this site. The first three are generated or vendored, so
# walking them costs seconds and answers nothing. `.claude` IS tracked, and is skipped for
# a different reason: it holds the review skills, whose own examples may name a `.ts` file
# that belongs to no build, and `include` would then be judged against it.
NOT_SOURCE_DIRS = {".git", "node_modules", "dist", ".claude"}
THEME_CSS = SRC / "shared" / "theme.css"
PAGES_TS = SRC / "shared" / "pages.ts"
# Templates for a play's seven pages, instantiated per play by vite.config.ts.
PAGES_DIR = REPO_ROOT / "pages"
PLAYS_TS = SRC / "shared" / "plays.ts"
REDUCER_TS = SRC / "editor" / "reducer.ts"
RECORDER_TSX = SRC / "recorder" / "App.tsx"
PROCESS_UPLOADS_PY = REPO_ROOT / "scripts" / "process_uploads.py"
CHARACTER_COLORS_TS = SRC / "shared" / "characterColors.ts"

# Tokens a shared header rule must not consume: each is re-skinned somewhere (the
# first three by the editor, the seal pair by every page).
FORBIDDEN_IN_HEADER = (
    "--accent",
    "--font-serif",
    "--shadow",
    "--page-mark",
    "--page-mark-soft",
)

# Deliberate exception: the home link is the FOOT of its header and wears its
# colour, carrying `page-${page}` itself (HomeLink.tsx), which CSS alone cannot show.
HEADER_TOKEN_EXEMPT_PREFIX = ".play-header-home"
EXEMPT_TOKENS = ("--page-mark", "--page-mark-soft")

# The README's play-creation link, relative like every link it carries into GitHub:
# `../../new/<branch>?filename=uploads/<zone>/<name>&value=<prefilled file>`. The Action
# reads neither the name nor the extension of what lands in the zone, so what is pinned
# is the branch, the zone, and the body the link prefills.
README_CREATION = re.compile(
    r"\.\./\.\./new/([^/?\s)]+)\?filename=uploads/([^/?\s)]+)/[^?\s)&]*(?:&value=([^)\s]*))?"
)


def catalogue_value(locale: str, key: str) -> str:
    """A catalogue entry's TEXT, source-read like everything else here (no JS engine).
    Handles the entries written as several literals joined by `+`: `manage.new.fileNote`
    is the one whose line breaks are DATA, being written into a file GitHub's editor
    does not wrap."""
    source = read(SRC / "shared" / "locales" / f"{locale}.ts")
    entry = re.search(
        rf'^  "{re.escape(key)}":((?:.|\n)*?),\n(?=  (?:"|//|\}}))', source, re.MULTILINE
    )
    if entry is None:
        raise AssertionError(f"{key} not found in src/shared/locales/{locale}.ts")
    # Both quote styles: en.ts single-quotes the line that carries GitHub's own label.
    parts = re.findall(r"\"((?:[^\"\\]|\\.)*)\"|'((?:[^'\\]|\\.)*)'", entry.group(1))
    joined = "".join(double or single for double, single in parts)
    return joined.replace("\\n", "\n").replace('\\"', '"').replace("\\'", "'")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def published_scripts():
    """(id, script) per play with a readable script; a play without one is skipped
    (the folder can be born of a refused upload)."""
    for play_id in play_ids():
        path = play_data_dir(play_id) / "script.json"
        if path.exists():
            yield play_id, json.loads(read(path))


def source_files(suffixes: tuple[str, ...] = (".ts", ".tsx")):
    """Every front source in the repo, build output and dependencies aside. A WALK and
    not a glob over `src/`: the point of the callers below is to catch a source sitting
    where nothing looks for it (vite.config.ts is already one)."""
    stack = [REPO_ROOT]
    while stack:
        for entry in sorted(stack.pop().iterdir()):
            if entry.is_dir():
                if entry.name not in NOT_SOURCE_DIRS:
                    stack.append(entry)
            elif entry.suffix in suffixes:
                yield entry


def css(path: Path) -> str:
    """CSS without its comments: a comment quoting a token is not a declaration."""
    return re.sub(r"/\*.*?\*/", "", read(path), flags=re.DOTALL)


def without_comments(source: str) -> str:
    """Source without its comments, skipping over strings: comments here QUOTE code
    (T.tsx documents `<T k="key" …>`) and a naive `//` split cuts inside URLs.
    Accepted limit: a regex holding a quote reads as a string start."""
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
    """SAFE_ID (editor/reducer.ts) vs LINE_ID_PATTERN (process_uploads.py): line
    ids name the mp3 files, so both guards must say exactly the same thing."""

    def test_safe_id_and_line_id_pattern_are_the_same_expression(self):
        match = re.search(r"export const SAFE_ID(?:\s*:[^=]+)? = /(.+?)/;", read(REDUCER_TS))
        self.assertIsNotNone(match, "SAFE_ID not found in src/editor/reducer.ts")
        self.assertEqual(
            match.group(1),
            LINE_ID_PATTERN.pattern,
            "SAFE_ID (src/editor/reducer.ts) and LINE_ID_PATTERN "
            "(scripts/process_uploads.py) have diverged: they name the same "
            "mp3 files and must stay identical down to the character.",
        )

    def test_the_pattern_stays_anchored_and_bounded(self):
        # Unanchored, "../x-1" slips through the middle; unbounded, an id names a file.
        pattern = LINE_ID_PATTERN.pattern
        self.assertTrue(pattern.startswith("^"))
        self.assertTrue(pattern.endswith("$"))
        self.assertIn("{1,", pattern)


class TestPlayIdPattern(unittest.TestCase):
    """SAFE_PLAY_ID (shared/plays.ts) vs PLAY_ID_PATTERN (common.py)."""

    def test_safe_play_id_and_play_id_pattern_are_the_same_expression(self):
        match = re.search(r"export const SAFE_PLAY_ID(?:\s*:[^=]+)? = /(.+?)/;", read(PLAYS_TS))
        self.assertIsNotNone(match, "SAFE_PLAY_ID not found in src/shared/plays.ts")
        self.assertEqual(
            match.group(1),
            PLAY_ID_PATTERN.pattern,
            "SAFE_PLAY_ID (src/shared/plays.ts) and PLAY_ID_PATTERN "
            "(scripts/common.py) have diverged: they name the same folders and "
            "must stay identical down to the character.",
        )

    def test_the_pattern_stays_anchored_and_bounded(self):
        pattern = PLAY_ID_PATTERN.pattern
        self.assertTrue(pattern.startswith("^"))
        self.assertTrue(pattern.endswith("$"))
        self.assertIn("{0,", pattern)

    def test_the_pattern_accepts_what_slugify_produces(self):
        # `slugify` (src/shared/data.ts) is the only function feeding the pattern.
        for good in ("transport-de-femmes", "le-malade-imaginaire", "piece2", "a"):
            self.assertIsNotNone(PLAY_ID_PATTERN.fullmatch(good), good)
        for bad in ("-tiret-en-tete", "Majuscule", "avec espace", "accentué", "a" * 65, ""):
            self.assertIsNone(PLAY_ID_PATTERN.fullmatch(bad), bad)


class TestPlayIdMinting(unittest.TestCase):
    """`mintPlayId` (shared/plays.ts) announces the address, `mint_play_id`
    (common.py) decides it. Diverged, the play appears where nobody was told to look.
    A shared table of cases holds both suites."""

    CASES_PATH = REPO_ROOT / "scripts" / "tests" / "play-id-cases.json"

    def cases(self) -> list[dict]:
        return json.loads(read(self.CASES_PATH))

    def test_the_shared_table_is_read_and_covers_more_than_the_easy_cases(self):
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
        source = read(SRC / "shared" / "plays.test.ts")
        self.assertIn(self.CASES_PATH.name, source)

    def test_every_minted_identifier_is_accepted_by_the_pattern(self):
        for case in self.cases():
            if case["id"] == "":
                continue
            with self.subTest(case["name"]):
                self.assertTrue(is_play_id(mint_play_id(case["title"])))

    def test_a_non_string_title_mints_nothing(self):
        for bad in (None, 42, [], {}, b"Antigone"):
            self.assertEqual(mint_play_id(bad), "")


class TestCreationZone(unittest.TestCase):
    """NEW_PLAY_DIR, in shared/data.ts and process_uploads.py. Diverged, the file
    lands in a folder nothing scans: no play, no journal line, no error. It must
    also stay outside PLAY_ID_PATTERN or `main` reads the zone as a play."""

    def front_zone(self) -> str:
        found = re.search(r'const NEW_PLAY_DIR(?:\s*:[^=]+)? = "([^"]+)";', read(SRC / "shared" / "data.ts"))
        self.assertIsNotNone(found, "NEW_PLAY_DIR not found in src/shared/data.ts")
        return found.group(1)

    def test_both_sides_name_the_same_folder(self):
        self.assertEqual(
            self.front_zone(),
            NEW_PLAY_DIR,
            "NEW_PLAY_DIR (src/shared/data.ts) and NEW_PLAY_DIR "
            "(scripts/process_uploads.py) have diverged: the site would commit the file "
            "into a folder the Action does not read, and nothing would say so.",
        )

    def test_the_folder_can_never_be_a_play_id(self):
        self.assertIsNone(PLAY_ID_PATTERN.fullmatch(NEW_PLAY_DIR), NEW_PLAY_DIR)

    def front_separator(self) -> str:
        found = re.search(r'const TITLE_SEPARATOR(?:\s*:[^=]+)? = "([^"]+)";', read(SRC / "shared" / "data.ts"))
        self.assertIsNotNone(found, "TITLE_SEPARATOR not found in src/shared/data.ts")
        return found.group(1)

    def test_both_sides_agree_on_the_line_that_closes_the_title(self):
        # Diverged, the note is read as title and every creation is refused.
        self.assertEqual(
            self.front_separator(),
            TITLE_SEPARATOR,
            "TITLE_SEPARATOR (src/shared/data.ts) and TITLE_SEPARATOR "
            "(scripts/process_uploads.py) have diverged: the note the site writes into "
            "the file would be read as part of the play's title.",
        )

    def test_the_separator_is_not_a_title_anyone_could_type(self):
        self.assertEqual(mint_play_id(TITLE_SEPARATOR), "")

    def test_the_site_writes_the_folder_into_the_url_it_opens(self):
        # The constant could exist and be used nowhere.
        source = without_comments(read(SRC / "shared" / "data.ts"))
        self.assertIn("uploads/${NEW_PLAY_DIR}/", source)

    def front_branch(self) -> str:
        found = re.search(r'const BRANCH(?:\s*:[^=]+)? = "([^"]+)";', read(SRC / "shared" / "data.ts"))
        self.assertIsNotNone(found, "BRANCH not found in src/shared/data.ts")
        return found.group(1)

    def test_the_readme_opens_the_same_creation_zone_as_the_site(self):
        """The install's last step is the everyday create-a-play gesture, so the README
        hand-writes by hand the URL `githubNewPlayUrl` builds from these constants, and
        becomes a third side of both. Absence is not an error: a fork may rewrite its
        front page. A WRONG one is silent twice over: a bad branch answers with the
        repository home page rather than a 404, and a bad folder commits where no
        workflow watches, so the play simply never appears.
        """
        found = README_CREATION.search(read(REPO_ROOT / "README.md"))
        if found is None:
            self.skipTest("README.md carries no play-creation link")
        branch, zone, value = found.group(1), found.group(2), found.group(3)
        self.assertEqual(
            branch,
            self.front_branch(),
            "the README's creation link and BRANCH (src/shared/data.ts) name different "
            "branches: GitHub answers a branch it does not know with the repository "
            "home page, so the button looks alive and creates nothing.",
        )
        self.assertEqual(
            zone,
            NEW_PLAY_DIR,
            "the README's creation link and NEW_PLAY_DIR (src/shared/data.ts, "
            "scripts/process_uploads.py) name different folders: the install's last "
            "step would commit into a folder the Action does not read.",
        )
        if value is None:
            return
        # The body the link prefills, read exactly as the Action will read it. An EMPTY
        # first line on purpose: the coordinator types the title there, and a file
        # committed untouched is refused by name rather than minting a play called
        # after the placeholder. read_title is the arbiter, so call it.
        body = unquote(value)
        with self.assertRaises(UploadError):
            read_title(self.written(body))
        self.assertEqual(
            read_title(self.written("Le Malade imaginaire" + body)),
            "Le Malade imaginaire",
        )
        # ONE box, ONE sentence: the coordinator reaches GitHub's editor either from the
        # site's "Nouvelle pièce" tile, which passes `manage.new.fileNote` through
        # `githubNewPlayUrl`, or from this link, which cannot call a catalogue and so
        # spells the French out. Drifted, the same gesture would explain itself twice,
        # differently. The empty title line is the only allowed difference: the site
        # already knows the title, the README does not.
        self.assertEqual(
            body,
            f"\n{TITLE_SEPARATOR}\n{catalogue_value('fr', 'manage.new.fileNote')}\n",
            "the README's creation link and manage.new.fileNote (src/shared/locales/"
            "fr.ts) prefill different notes: the same file, opened the same way, would "
            "carry different instructions depending on where the coordinator started.",
        )

    def written(self, text: str) -> Path:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        path = Path(folder.name) / "creation.txt"
        path.write_text(text, encoding="utf-8")
        return path


class TestDevPlay(unittest.TestCase):
    """DEV_PLAY_ID, in shared/plays.ts and common.py. The test bench is absent from
    data/plays.json, so the creation box needs the id in hand to refuse that address;
    and the id names real folders, so it must be a valid play id."""

    def front_dev_play(self) -> str:
        found = re.search(r'export const DEV_PLAY_ID(?:\s*:[^=]+)? = "([^"]+)";', read(PLAYS_TS))
        self.assertIsNotNone(found, "DEV_PLAY_ID not found in src/shared/plays.ts")
        return found.group(1)

    def test_both_sides_name_the_same_play(self):
        self.assertEqual(
            self.front_dev_play(),
            DEV_PLAY_ID,
            "DEV_PLAY_ID (src/shared/plays.ts) and DEV_PLAY_ID (scripts/common.py) have "
            "diverged: the creation box would offer an address the Action refuses, or "
            "would refuse one that is free.",
        )

    def test_the_test_bench_carries_a_real_play_id(self):
        self.assertTrue(is_play_id(DEV_PLAY_ID))

    def test_the_creation_box_refuses_that_address(self):
        # The constant could exist and be consulted nowhere.
        source = without_comments(read(SRC / "chooser" / "NewPlay.tsx"))
        self.assertIn("DEV_PLAY_ID", source)

    def test_the_dev_server_announces_it_and_opens_it(self):
        # dev.sh imports no constant, hence the literal path: renamed, it 404s.
        self.assertIn(
            f"plays/{DEV_PLAY_ID}/respo.html",
            read(REPO_ROOT / "scripts" / "dev.sh"),
            "scripts/dev.sh no longer opens the test bench under the name DEV_PLAY_ID "
            "(scripts/common.py) gives it.",
        )
        self.assertIn("DEV_PLAY_ID", without_comments(read(REPO_ROOT / "vite.config.ts")))

    def test_it_is_the_only_play_the_index_leaves_out(self):
        # A second hidden play would be one nobody could reach.
        self.assertEqual(
            sorted(set(play_ids()) - set(listed_play_ids())),
            [DEV_PLAY_ID] if DEV_PLAY_ID in play_ids() else [],
        )


class TestNewPlay(unittest.TestCase):
    """`new_play_script` (common.py) vs `EMPTY_SCRIPT` (editor/reducer.ts)."""

    def empty_script_keys(self) -> set[str]:
        body = re.search(
            r"export const EMPTY_SCRIPT(?:\s*:[^=]+)? = \{(.*?)^\};", read(REDUCER_TS), re.DOTALL | re.MULTILINE
        )
        self.assertIsNotNone(body, "EMPTY_SCRIPT not found in src/editor/reducer.ts")
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
        fresh = new_play_script("antigone", "Antigone", "fr")
        self.assertEqual(fresh["acts"], [{"scenes": [{"lines": []}]}])
        self.assertEqual(fresh["characters"], [])


class TestCharacterPalette(unittest.TestCase):
    """The palette lives in JS only; COLOR_PATTERN (build_manifest.py) validates its
    FORM. A colour written otherwise ("#FFF", `oklch()`) drops from the manifest."""

    def palette(self) -> list[str]:
        body = re.search(
            r"export const CHARACTER_COLORS(?:\s*:[^=]+)? = \[(.*?)^\];",
            read(CHARACTER_COLORS_TS),
            re.DOTALL | re.MULTILINE,
        )
        self.assertIsNotNone(body, "CHARACTER_COLORS not found in characterColors.ts")
        return re.findall(r'"(#[0-9a-fA-F]+)"', body.group(1))

    def test_the_palette_is_found_and_has_its_twenty_colours(self):
        # Twenty: Tableau 10 then the ten light shades of tab20.
        palette = self.palette()
        self.assertEqual(len(palette), 20, f"palette read: {palette}")
        self.assertEqual(len(set(palette)), 20, "two characters cannot share the same colour")

    def test_every_palette_colour_survives_the_python_validation(self):
        for color in self.palette():
            self.assertIsNotNone(
                COLOR_PATTERN.match(color),
                f"{color} (src/shared/characterColors.ts) is refused by "
                f"COLOR_PATTERN (scripts/build_manifest.py), so it would not "
                f"make it through the manifest.",
            )

    def test_the_python_validation_stays_anchored(self):
        # Unanchored, "#1f77b4; background: url(...)" reaches a `style` attribute.
        self.assertTrue(COLOR_PATTERN.pattern.endswith(r"\Z"))


class TestReservedHeaderTokens(unittest.TestCase):
    """`--header-*` tokens are declared in theme.css and redefined nowhere, so the
    shared header renders identically on every page. The list is read, not written."""

    def reserved_tokens(self) -> set[str]:
        root = re.search(r":root\s*\{(.*?)\}", css(THEME_CSS), re.DOTALL)
        self.assertIsNotNone(root, ":root not found in theme.css")
        return set(re.findall(r"(--header-[a-z-]+)\s*:", root.group(1)))

    def test_there_are_reserved_tokens_to_guard(self):
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
        theme = css(THEME_CSS)
        # Leading indentation tolerated, or the header's `@media` rules escape.
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
                # The closing parenthesis keeps --shadow from matching --shadow-hover.
                if re.search(rf"var\(\s*{re.escape(token)}\s*\)", body):
                    leaks.append(f"{selector.strip()} consumes var({token})")
        self.assertEqual(
            leaks,
            [],
            "The shared header draws its identity from a token a page can "
            "re-skin; it needs a reserved token (--header-*). " + " ; ".join(leaks),
        )


class TestPageSeals(unittest.TestCase):
    """`PAGES` (pages.ts) names the pages, `.page-<key>` (theme.css) colours them,
    and nothing in the code links the two."""

    def page_keys(self) -> set[str]:
        body = re.search(r"export const PAGES(?:\s*:[^=]+)? = \{(.*?)^\};", read(PAGES_TS), re.DOTALL | re.MULTILINE)
        self.assertIsNotNone(body, "PAGES not found in src/shared/pages.ts")
        return set(re.findall(r"^  ([a-zA-Z]+): \{", body.group(1), re.MULTILINE))

    def test_pages_are_found(self):
        self.assertGreaterEqual(len(self.page_keys()), 5)

    def seal_declarations(self) -> dict[str, set[str]]:
        """{page key: declared variables}. Selectors are grouped, hence the split."""
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
        """The favicon IS the seal badge, but a `<link>` reads no CSS variable, so a
        page duplicated from another keeps its hex values. Pairing: `PAGES[key].href`."""
        pages_js = read(PAGES_TS)
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
            # Presence only: the masks favicon repeats the soft shade in its fills.
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
        """iOS reads no SVG favicon nor `data:` URI, and invents one if it is missing."""
        pages_js = read(PAGES_TS)
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
    """A PAGES `href` with no template is a dead link; a vite entry with no .html
    breaks the build."""

    def test_every_pages_href_points_to_a_real_html_file(self):
        hrefs = re.findall(r'href: "\./([a-z]+\.html)"', read(PAGES_TS))
        self.assertGreaterEqual(len(hrefs), 5)
        for href in hrefs:
            self.assertTrue((PAGES_DIR / href).is_file(), f"{href} declared in PAGES but missing")

    def test_every_root_html_is_a_vite_entry(self):
        """The two root pages are the only literal Vite entries."""
        config = read(REPO_ROOT / "vite.config.ts")
        entries = set(re.findall(r'resolve\(ROOT, "([a-z]+\.html)"\)', config))
        on_disk = {p.name for p in REPO_ROOT.glob("*.html")}
        self.assertEqual(
            entries,
            on_disk,
            "The root entries of vite.config.ts and the root .html files have "
            "diverged: an entry with no file breaks the build, a file with no "
            "entry is never built nor deployed.",
        )

    def test_every_play_page_template_is_instantiated_by_the_build(self):
        """PLAY_PAGES (vite.config.ts) vs `pages/*.html`: a missing template 404s."""
        config = read(REPO_ROOT / "vite.config.ts")
        declared = re.search(r"const PLAY_PAGES(?:\s*:[^=]+)? = \[([^\]]*)\]", config)
        self.assertIsNotNone(declared, "PLAY_PAGES not found in vite.config.ts")
        listed = set(re.findall(r'"([a-z]+)"', declared.group(1)))
        on_disk = {p.stem for p in PAGES_DIR.glob("*.html")}
        self.assertEqual(
            listed,
            on_disk,
            "PLAY_PAGES (vite.config.ts) and the templates in pages/ have diverged.",
        )

    def test_the_play_pages_cover_every_page_of_the_site(self):
        """Those templates are exactly what PAGES declares, plus the second home page."""
        keys = set(re.findall(r"^  ([a-zA-Z]+): \{", read(PAGES_TS), re.MULTILINE))
        # `home` is a play's `index.html`; `respo` is its coordinator twin, not in PAGES.
        expected = (keys - {"home"}) | {"index", "respo"}
        self.assertEqual(expected, {p.stem for p in PAGES_DIR.glob("*.html")})


class TestScriptDiffFields(unittest.TestCase):
    """`script_changes` (script_diff.py) writes the counts, `CHANGE_LABEL_KEYS`
    (dashboard/App.tsx) has a sentence for each. Renamed on one side, the row
    silently stops showing that count."""

    def python_fields(self) -> set[str]:
        was = {
            "characters": [{"id": "c1", "name": "Serge"}, {"id": "c2", "name": "Annie"}],
            "acts": [
                {
                    "scenes": [
                        {
                            "lines": [
                                {"id": "l1", "characterId": "c1", "text": "Un"},
                                {"id": "l2", "characterId": "c1", "text": "Deux"},
                                # Gone in `now`: linesRemoved.
                                {"id": "l3", "characterId": "c2", "text": "Trois"},
                            ]
                        }
                    ]
                }
            ],
        }
        now = {
            "title": "Le Malade imaginaire",
            "language": "en",
            "characters": [{"id": "c1", "name": "Sergio"}, {"id": "c3", "name": "Tim"}],
            "acts": [
                {
                    "scenes": [
                        {
                            "lines": [
                                {"id": "l1", "characterId": "c1", "text": "Un, mais autrement"},
                                # Same text, other character: linesReassigned.
                                {"id": "l2", "characterId": "c3", "text": "Deux"},
                                {"id": "l4", "characterId": "c3", "text": "Quatre"},
                            ]
                        }
                    ]
                }
            ],
        }
        # Three calls: `other` speaks only when nothing else does (hence a lone
        # colour change) and `created` replaces almost everything.
        recoloured = {
            **was,
            "characters": [
                {"id": "c1", "name": "Serge", "color": "#e15759"},
                {"id": "c2", "name": "Annie"},
            ],
        }
        fields = (
            set(script_changes(was, now))
            | set(script_changes(was, recoloured))
            | set(script_changes({}, now, created=True))
        )
        # Or the comparison below agrees on a short list.
        self.assertGreaterEqual(len(fields), 11, "the fixtures no longer trigger every field")
        return fields

    def test_the_front_has_a_sentence_for_every_count_the_action_writes(self):
        body = re.search(
            r"const CHANGE_LABEL_KEYS(?:\s*:[^=]+)? = \{(.*?)\};", read(SRC / "dashboard" / "App.tsx"), re.S
        )
        self.assertIsNotNone(body, "CHANGE_LABEL_KEYS not found in dashboard/App.tsx")
        front = set(re.findall(r"^  ([a-zA-Z]+):", body.group(1), re.MULTILINE))
        self.assertEqual(front, self.python_fields())


class TestCatalogues(unittest.TestCase):
    """The i18n guards, by static reading (this project has no component test): a
    mistyped key shows verbatim on screen, a forgotten string stays French in the
    English UI. Parity is checked JS-side (locales/parity.test.ts, Intl.PluralRules)."""

    LOCALES_DIR = SRC / "shared" / "locales"

    def catalogue_keys(self, locale: str) -> set[str]:
        """The keys declared in a catalogue: read from source, no JS engine here."""
        source = read(self.LOCALES_DIR / f"{locale}.ts")
        return set(re.findall(r'^  "([a-zA-Z0-9_.]+)":', source, re.MULTILINE))

    def test_catalogues_are_found_and_not_empty(self):
        for locale in ("fr", "en"):
            self.assertGreaterEqual(
                len(self.catalogue_keys(locale)), 10, f"catalogue {locale} not found or empty"
            )

    def scanned_files(self):
        """The front-end sources, excluding tests and catalogues."""
        for path in sorted(SRC.rglob("*.ts*")):
            if path.name.endswith(".test.ts") or path.parent == self.LOCALES_DIR:
                continue
            yield path

    def used_keys(self) -> dict[str, set[str]]:
        """{key used: {files}} for every key written out plainly: a `t(…)` / `<T k>`
        call, a `*_KEYS?` table, or `mountPage(…)`. A key COMPOSED at runtime is
        invisible and covered by pattern in the orphan-key test."""
        used: dict[str, set[str]] = {}
        for path in self.scanned_files():
            source = without_comments(read(path))
            found = [
                key
                for callee in ("t", "mountPage")
                for call in self.balanced_calls(source, callee)
                # At least one dot: the sweep also sees non-key literals.
                for key in re.findall(r'"([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)"', call)
            ]
            found += re.findall(r'<T\s[^>]*?\bk="([a-zA-Z0-9_.]+)"', source)
            for table in re.findall(
                r"\b[A-Z][A-Z0-9_]*KEYS?\b(?:\s*:[^=]+)?\s*=\s*[\[{](.*?)[\]}];", source, re.S
            ):
                found += re.findall(r'"([a-zA-Z0-9_.]+)"', table)
            for key in found:
                used.setdefault(key, set()).add(path.relative_to(REPO_ROOT).as_posix())
        return used

    @staticmethod
    def balanced_calls(source: str, callee: str) -> list[str]:
        """Contents of each `<callee>(…)`, balanced, so a nested call or a ternary
        argument does not escape the scan."""
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
        """A key declared and never called means a string thought translated that
        stayed hardcoded in the JSX (it caught `common.loadingScript`)."""
        used = set(self.used_keys())
        # Keys composed at runtime, covered by pattern. Each is built in one place:
        #   page.<x>.label|desc      pageLabelKey / pageDescKey (pages.ts)
        #   structure.language.<xx>  LOCALES (StructurePanel.tsx)
        #   rail.<x>[.tip]           the icon strip (EditorRail.tsx)
        #   recorder.status.<x>      a line's label (recorder/App.tsx)
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

    # Three "no forgotten string" guards over ALL of `src/`: an accented literal, a
    # literal in a text-bearing attribute, a JSX text node. None suffices alone.

    # Accented literals that are NOT interface text. Adding one is a decision.
    ACCENT_ALLOWED = {
        # A language's name is written in that language (LocaleSwitch.tsx).
        "Français",
        # `makeFormats` quotation marks: locale DATA, and Intl does not expose CLDR's.
        "«\u00a0",
        "\u00a0»",
    }

    # Attributes and props that CARRY TEXT here, so a literal in one is interface
    # text. The repo's own list: a new text prop gets written in.
    TEXT_ATTRS = (
        "title",
        "aria-label",
        "aria-valuetext",
        "placeholder",
        "alt",
        "label",
        "hint",
        "error",
        # `PageState`'s waiting sentence, like the four below.
        "loading",
        "unit",
        "confirmLabel",
        "primaryLabel",
        "saveLabel",
    )

    # A file name and the brand: neither is translated.
    NOT_TEXT = {"script.json", "PrettyDrama"}

    # A `return` caught between a `>` and a `<` is not a text node.
    JS_KEYWORDS = {
        "return", "else", "if", "const", "let", "var", "for", "while", "break",
        "continue", "try", "catch", "finally", "default", "case", "throw", "new",
        "await", "async", "function", "export", "import", "delete", "typeof",
        "in", "of", "do", "switch", "class", "extends", "yield", "void",
    }

    ACCENTED = re.compile(r"[àâäçéèêëîïôöùûüÀÂÄÇÉÈÊËÎÏÔÖÙÛÜœæ«»]")
    # Two lowercase letters in a row: a word, not "(PDF)" or "✕".
    HAS_WORD = re.compile(r"[a-zà-ÿ]{2,}")
    # `${scene.act}` is already a translated label.
    INTERPOLATION = re.compile(r"\$\{[^}]*\}")
    CODE_CHARS = set("={}()[];\"'`&|$#\\/*<>@,")

    def test_no_accented_literal_survives_outside_the_catalogues(self):
        offenders = []
        for path in self.scanned_files():
            relative = path.relative_to(REPO_ROOT).as_posix()
            source = without_comments(read(path))
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
        # Sees French WITHOUT accents: "Renommer", "Pause", "Mot entier".
        pattern = re.compile(
            r"\b(" + "|".join(self.TEXT_ATTRS) + r')=\{?\s*(["\'`])(.*?)(?<!\\)\2', re.S
        )
        offenders = []
        for path in self.scanned_files():
            relative = path.relative_to(REPO_ROOT).as_posix()
            source = without_comments(read(path))
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

    # A TYPE ANNOTATION reads as a text node to this scan: `Record<string, unknown>`
    # closes on a `>` and the next generic opens on a `<`, so the code between the two
    # is captured like the inside of a tag. Recognised by SHAPE (`name: Type`,
    # `name?: Type`, or a leading `?`/`|`/`&`), which is the bound of the test below: a
    # real text node opening with "Note:" is not seen either. Accepted, the accent guard
    # and the key scan covering the French side.
    TYPE_FRAGMENT = re.compile(r"^[?|&]|^[A-Za-z_$][\w$]*\??\s*:")

    def test_no_jsx_text_node_carries_a_literal(self):
        """Text between two tags. Bounded to prose-looking lines with no code
        character and to what is not a type annotation (cf. TYPE_FRAGMENT); a text
        adjacent to a brace needs a real JSX parser, and the accent guard covers that
        case in French."""
        offenders = []
        for path in self.scanned_files():
            relative = path.relative_to(REPO_ROOT).as_posix()
            source = without_comments(read(path))
            for match in re.finditer(r">([^<>]*?)<", source, re.S):
                for line in match.group(1).split("\n"):
                    text = line.strip()
                    if not text or text in self.NOT_TEXT:
                        continue
                    if self.CODE_CHARS & set(text):
                        continue
                    if self.TYPE_FRAGMENT.match(text):
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
        return " " in text or text[0].isupper() or bool(re.search(r"[à-ÿÀ-Ý]", text))

    def test_every_page_key_has_its_label_and_desc(self):
        # `PAGES` carries no words, so a page added without them displays its key.
        page_keys = TestPageSeals.page_keys(self)
        missing = []
        for locale in ("fr", "en"):
            declared = self.catalogue_keys(locale)
            for page in sorted(page_keys):
                if f"page.{page}.label" not in declared:
                    missing.append(f"page.{page}.label ({locale})")
                if page != "home" and f"page.{page}.desc" not in declared:
                    missing.append(f"page.{page}.desc ({locale})")
        self.assertEqual(missing, [], "Missing page texts: " + ", ".join(missing))

    def test_no_entry_names_a_page_instead_of_interpolating_its_label(self):
        """A page label is interpolated through `{page}`, never copied into a sentence.
        Bounded to the "page X" / "mode X" turn of phrase: French page names are common
        nouns, so a broad search flags legitimate uses like "Enregistrement…"."""
        for locale, patterns in (
            ("fr", (r"\b(?:page|mode)\s+{label}\b",)),
            ("en", (r"\b{label}\s+(?:page|screen|mode)\b", r"\b(?:page|screen|mode)\s+{label}\b")),
        ):
            source = read(self.LOCALES_DIR / f"{locale}.ts")
            labels = dict(re.findall(r'"page\.([a-z]+)\.label":\s*"([^"]+)"', source))
            self.assertTrue(labels, f"no page label read in {locale}.ts")
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
        """The static `<title>` is the fallback before locale.ts runs, so a drift from
        the French catalogue makes the title visibly change on load."""
        source = read(self.LOCALES_DIR / "fr.ts")
        template = re.search(r'"common\.docTitle":\s*"([^"]+)"', source)
        self.assertIsNotNone(template, "common.docTitle not found in fr.ts")

        def label(key):
            found = re.search(rf'"{re.escape(key)}":\s*"([^"]+)"', source)
            self.assertIsNotNone(found, f"{key} missing from fr.ts")
            return found.group(1)

        # The `pages/` templates take their page's label (`respo.html` alone does not
        # bear its key's name); the two root pages have their own.
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
    """`structureLabels.ts` (screen) vs `STRUCTURE` (build_script_pdf.py, paper)."""

    LOCALES_DIR = SRC / "shared" / "locales"

    def front_template(self, locale: str, key: str) -> str:
        source = read(self.LOCALES_DIR / f"{locale}.ts")
        found = re.search(rf'"{re.escape(key)}":\s*"([^"]+)"', source)
        self.assertIsNotNone(found, f"{key} not found in {locale}.ts")
        return found.group(1)

    def test_the_pdf_words_match_the_catalogues(self):
        # `{n}` on the JS side, `%s` on the Python side: the only difference allowed.
        for locale, words in STRUCTURE.items():
            for kind, key in (("act", "structure.act"), ("scene", "structure.scene")):
                self.assertEqual(
                    words[kind].replace("%s", "{n}"),
                    self.front_template(locale, key),
                    f"{locale}/{kind}: the PDF and the screen would not name it the same way",
                )

    def test_both_sides_know_the_same_languages(self):
        js = set(re.findall(r'"([a-z]{2})"', re.search(
            r"export const LOCALES(?:\s*:[^=]+)? = \[(.*?)\];", read(SRC / "shared" / "i18n.ts"), re.DOTALL
        ).group(1)))
        self.assertEqual(set(LANGUAGES), js, "LANGUAGES (Python) and LOCALES (JS) have diverged")
        self.assertEqual(set(STRUCTURE), js, "the PDF's STRUCTURE does not cover every language")
        self.assertIn(DEFAULT_LANGUAGE, LANGUAGES)

    def test_the_roman_numerals_agree(self):
        js = read(SRC / "shared" / "structureLabels.ts")
        tens = re.search(r'const TENS(?:\s*:[^=]+)? = \[(.*?)\];', js, re.DOTALL).group(1)
        units = re.search(r'const UNITS(?:\s*:[^=]+)? = \[(.*?)\];', js, re.DOTALL).group(1)
        front_tens = re.findall(r'"([A-Z]*)"', tens)
        front_units = re.findall(r'"([A-Z]*)"', units)
        self.assertEqual(front_tens, list(_TENS), "the Roman tens have diverged")
        self.assertEqual(front_units, list(_UNITS), "the Roman units have diverged")
        expected = {1: "I", 4: "IV", 9: "IX", 10: "X", 14: "XIV", 39: "XXXIX", 40: "40", 0: "0"}
        for n, want in expected.items():
            self.assertEqual(roman_numeral(n), want, f"roman_numeral({n})")

    def test_no_act_or_scene_title_is_written_back_into_the_play(self):
        """A title here is data in one language, and it travels on to the PDF."""
        for play_id, script in published_scripts():
            self.assertIn(
                script.get("language"), LANGUAGES, f"{play_id}: the play must state its language"
            )
            for ai, act in enumerate(script.get("acts", [])):
                self.assertNotIn("title", act, f"{play_id}, act {ai}")
                for si, scene in enumerate(act.get("scenes", [])):
                    self.assertNotIn("title", scene, f"{play_id}, act {ai}, scene {si}")


class TestZipFormat(unittest.TestCase):
    """`downloadZip` (recorder/App.tsx) writes the archive, `parse_manifest`
    (process_uploads.py) reads it, and the two never run together: out of step, every
    ZIP an actor sends is refused. Loose about everything but the set of keys."""

    def manifest_keys_written(self) -> set:
        """The keys the Recorder puts in manifest.json."""
        source = without_comments(read(RECORDER_TSX))
        found = re.search(
            r'zip\.file\(\s*"manifest\.json"\s*,\s*JSON\.stringify\(\s*\{(.*?)\}', source, re.S
        )
        self.assertIsNotNone(found, "the call writing manifest.json is no longer recognisable")
        # Name only: a bare `\w+` would also catch the `id` of `manifest.id`.
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
        """`{lineId}.{ext}`: the extension is the recording browser's, so the Action
        looks the member up by id."""
        written = without_comments(read(RECORDER_TSX))
        self.assertTrue(
            re.search(r"zip\.file\(\s*`\$\{lineId\}\.\$\{take\.ext\}`", written),
            "recorder/App.tsx no longer names the audio member {lineId}.{ext}: the "
            "Action looks it up by id and would find nothing.",
        )
        source = read(PROCESS_UPLOADS_PY)
        body = source[source.index("def parse_manifest") : source.index("def process_zip")]
        self.assertIn("re.escape(line_id)", body)
        self.assertRegex(body, r'r"\\\.\[0-9a-zA-Z\]\+"')

    def test_the_play_id_travels_verbatim_from_the_manifest(self):
        """The field verifies and never routes, so it must be the manifest's own id."""
        source = without_comments(read(RECORDER_TSX))
        self.assertTrue(
            re.search(r"play:\s*manifest\.id", source),
            "recorder/App.tsx no longer writes the play id straight from the manifest.",
        )


class TestPublishedPlays(unittest.TestCase):
    """The real tree against the layout the site and the Action expect."""

    def test_no_play_script_claims_another_play_than_its_own_folder(self):
        """`validate_script` compares the two, so a mismatch refuses every upload of
        that play. Presence is deliberately NOT required: it accepts a script carrying
        no id, and failing here would stop a deploy over a good file."""
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
        """GitHub serves its upload page only on a folder it knows; git versions no
        empty folder, hence the `.gitkeep`."""
        for play_id in play_ids():
            zone = REPO_ROOT / "uploads" / play_id
            self.assertTrue(zone.is_dir(), f"uploads/{play_id}/ is missing")
            self.assertTrue((zone / ".gitkeep").exists(), f"uploads/{play_id}/.gitkeep is missing")


class TestTypeChecking(unittest.TestCase):
    """`tsc --noEmit` is the ONLY reader of the types: Vite (esbuild) and `node --test`
    (Node's type stripping) both ERASE them without looking. So none of this is style.
    It is whether the check happens at all, over everything, with nothing silencing it.

    The check itself is NOT run here: it needs `node_modules`, and this suite reads
    files. `build.yml` runs it, and one test below is what holds that."""

    def tsconfig(self) -> dict:
        """tsconfig.json carries `//` comments (its own reasons), which `json` refuses."""
        return json.loads(without_comments(read(TSCONFIG_PATH)))

    def relative(self, path: Path) -> str:
        return path.relative_to(REPO_ROOT).as_posix()

    def test_the_typecheck_is_strict_and_emits_nothing(self):
        options = self.tsconfig()["compilerOptions"]
        self.assertIs(
            options.get("strict"), True, "strict is off: the annotations stop being checked"
        )
        self.assertIs(
            options.get("noEmit"), True, "tsc must judge and never emit: Vite is what builds"
        )
        # Import specifiers carry the REAL extension because `node --test` resolves what
        # is written (cf. the specifier test below). Without this the tree stops compiling.
        self.assertIs(options.get("allowImportingTsExtensions"), True)

    def test_no_compiler_option_is_turned_off(self):
        """In a tsconfig every `false` is a LOOSENING, and `strict` is a family whose
        members can be disabled one at a time behind it: measured, `noImplicitAny: false`
        alone hid 473 errors while `strict: true` sat right above it. Hence the blanket
        rule rather than a list of flags to keep in step with TypeScript's releases."""
        off = [
            option for option, value in self.tsconfig()["compilerOptions"].items() if value is False
        ]
        self.assertEqual(
            off,
            [],
            "these compiler options are off, which loosens the check: " + ", ".join(off),
        )

    def test_the_typecheck_sees_every_source_file(self):
        """`include` is a two-entry list, so a source outside it is never read by
        anything: it compiles in the browser and its types are decoration."""
        included = [REPO_ROOT / entry for entry in self.tsconfig()["include"]]
        unchecked = [
            self.relative(path)
            for path in source_files()
            if not any(path == entry or entry in path.parents for entry in included)
        ]
        self.assertEqual(
            unchecked,
            [],
            "outside tsconfig.json's `include`, hence type-checked by nothing: "
            + ", ".join(unchecked),
        )

    def test_the_typecheck_runs_in_ci_before_the_build(self):
        script = json.loads(read(PACKAGE_JSON))["scripts"].get("typecheck", "")
        self.assertIn("--noEmit", script, "`npm run typecheck` no longer runs tsc")
        workflow = read(BUILD_WORKFLOW)
        self.assertIn(
            "npm run typecheck",
            workflow,
            "build.yml no longer typechecks: a type error would then reach the deploy",
        )
        # BEFORE the build, which succeeds on the very code the check refuses.
        self.assertLess(
            workflow.index("npm run typecheck"),
            workflow.index("npm run build"),
            "build.yml typechecks AFTER building, so the build is what reports first",
        )

    def test_the_react_types_describe_the_react_that_is_installed(self):
        """`@types/react` one major ahead of `react` is the worst kind of green check:
        it announces hooks and a `ref` prop this React does not have, and the checker
        being the ONLY reader, nothing else would refuse the code before the browser
        does. Majors only: the types are versioned independently within one."""
        manifest = json.loads(read(PACKAGE_JSON))
        runtime = manifest["dependencies"]
        types = manifest["devDependencies"]
        for package in ("react", "react-dom"):
            self.assertEqual(
                re.sub(r"^\D*(\d+).*", r"\1", types[f"@types/{package}"]),
                re.sub(r"^\D*(\d+).*", r"\1", runtime[package]),
                f"@types/{package} and {package} are on different majors: the "
                f"typecheck would accept an API this React does not ship.",
            )

    def test_no_type_error_is_silenced(self):
        """The escape hatches, which turn a checked file into an unchecked one without
        changing anything visible. A cast is the honest way to overrule the checker: it
        says what the value is, where these say only "not now"."""
        offenders = [
            f"{self.relative(path)}: {directive}"
            for path in source_files()
            for directive in ("@ts-ignore", "@ts-nocheck", "@ts-expect-error")
            if directive in read(path)
        ]
        self.assertEqual(offenders, [], "type errors silenced: " + ", ".join(offenders))

    def test_every_relative_import_names_the_file_it_resolves(self):
        """The pure modules run under `node --test` with NO bundler, so Node resolves the
        specifier AS WRITTEN. A `.js` left over from the migration, or an extension left
        off because Vite would have guessed it, is a module not found at test time."""
        offenders = []
        for path in source_files():
            for spec in re.findall(
                r'(?:from|import)\s*\(?\s*"(\.[^"]*)"', without_comments(read(path))
            ):
                if not spec.endswith((".ts", ".tsx", ".css", ".json")):
                    offenders.append(f"{self.relative(path)}: '{spec}'")
        self.assertEqual(
            offenders,
            [],
            "these relative imports do not name a real file: " + ", ".join(offenders),
        )

    def test_no_source_file_is_javascript(self):
        """The migration is not half-done anywhere. `allowJs` is unset, so a `.js` back
        in the tree is read by no checker and resolved by no import."""
        left = [self.relative(path) for path in source_files((".js", ".jsx", ".mjs", ".cjs"))]
        self.assertEqual(left, [], "JavaScript left in the tree: " + ", ".join(left))

    def test_no_comment_names_a_file_that_no_longer_exists(self):
        """The class of dirt a rename leaves behind: CLAUDE.md's doctrine puts the reason
        for a rule in a comment AT THE SITE, and those comments cite files by name, in
        the CSS as much as in the sources: five of them still named the old extension
        after the migration, the CSS having no import for a rename to follow, and each
        sent the next reader looking for a file that is not there.
        Bounded to a NAME followed by the extension, so the trap in CLAUDE.md that
        deliberately writes a bare `.js` is not a match. Nor is this docstring, which is
        why it describes the case instead of spelling one out."""
        pattern = re.compile(r"\b(\w+\.jsx?)\b")
        text_suffixes = (".ts", ".tsx", ".css", ".html", ".py", ".yml", ".md", ".sh")
        offenders = []
        for path in source_files(text_suffixes):
            for name in set(pattern.findall(read(path))):
                offenders.append(f"{self.relative(path)}: '{name}'")
        self.assertEqual(
            offenders,
            [],
            "these comments name a JavaScript file, which this repo no longer has: "
            + ", ".join(sorted(offenders)),
        )


if __name__ == "__main__":
    unittest.main()
