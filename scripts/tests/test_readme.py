"""README.md invariants: site links are `<!-- ref: SITE_… -->` placeholders that
`ci/update_readme_urls.py` fills in, and a ref that stops matching fails silently.
Runs in every copy of the template, so absence is never an error here."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ci"))

from update_readme_urls import LINK, PATHS, README, SITE_URL, update

# Any `ref:` comment, ours or not, so one LINK stopped matching stays visible.
ANY_REF = re.compile(r"<!--\s*ref:\s*([A-Za-z0-9_]+)\s*-->")

TEXT = README.read_text(encoding="utf-8")
REFS = [match.group(4) for match in LINK.finditer(TEXT)]


class TestTheRegexItself(unittest.TestCase):
    """A README LINK cannot parse would make every test below pass vacuously."""

    def test_link_splits_text_target_and_ref(self):
        found = LINK.search("[Le site](https://x.test/y) <!-- ref: SITE_HOME -->")
        self.assertEqual(found.group(1), "[Le site](")
        self.assertEqual(found.group(2), "https://x.test/y")
        self.assertEqual(found.group(4), "SITE_HOME")

    def test_link_ignores_a_ref_outside_the_site_namespace(self):
        self.assertIsNone(LINK.search("[x](https://y.test) <!-- ref: OTHER_001 -->"))

    def test_link_ignores_a_link_with_no_ref(self):
        self.assertIsNone(LINK.search("[x](https://y.test) et du texte"))


class TestSiteLinks(unittest.TestCase):
    def test_every_site_ref_is_one_the_script_knows(self):
        # An unknown SITE_ ref stops the deployment's README step.
        for ref in REFS:
            with self.subTest(ref=ref):
                self.assertIn(ref, PATHS)

    def test_no_site_ref_was_left_unmatched_by_the_link_pattern(self):
        loose = [r for r in ANY_REF.findall(TEXT) if r.startswith("SITE_")]
        self.assertEqual(sorted(loose), sorted(REFS))

    def test_each_ref_appears_at_most_once(self):
        self.assertEqual(len(REFS), len(set(REFS)))

    def test_the_troupe_and_management_links_are_both_there(self):
        # Both directions: a ref added to PATHS with no link in the README fails too.
        self.assertEqual(sorted(REFS), sorted(PATHS))

    def test_every_ref_target_is_an_absolute_address(self):
        # A relative target would link into the repository, not the site.
        for match in LINK.finditer(TEXT):
            with self.subTest(ref=match.group(4)):
                self.assertTrue(SITE_URL.fullmatch(match.group(2)), match.group(2))

    def test_a_deployment_would_rewrite_every_one_of_them(self):
        # End-to-end on the real file, second deployment included.
        site = "https://troupe.github.io/piece/"
        out = update(TEXT, site)
        for ref in REFS:
            with self.subTest(ref=ref):
                self.assertIn(f"]({site}{PATHS[ref]})", out)
        self.assertIsNone(update(out, site))


class TestGitHubLinks(unittest.TestCase):
    """Links into GitHub are relative so they resolve against the reader's copy:
    a README at `/<owner>/<repo>/blob/<branch>/README.md` needs exactly `../../`.
    """

    def setUp(self):
        self.targets = re.findall(r"\[[^\]]*\]\(([^)\s]+)\)", TEXT)
        self.relative = [t for t in self.targets if t.startswith(".")]

    def test_every_relative_link_climbs_exactly_two_levels(self):
        for target in self.relative:
            with self.subTest(target=target):
                self.assertTrue(target.startswith("../../"), "wrong depth")
                self.assertFalse(target[len("../../"):].startswith("../"), "too deep")

    def test_no_relative_link_names_a_branch(self):
        # These links assume nothing about the copy they are read in.
        for target in self.relative:
            with self.subTest(target=target):
                self.assertNotIn("main", target[len("../../"):].split("/"))

    def test_no_absolute_link_to_a_page_of_ones_own_repository(self):
        # Prevents a troupe clicking "Settings" and landing in another repo; only
        # these pages, since crediting the original project is legitimate.
        own = ("settings", "actions", "deployments", "issues", "pulls")
        for target in self.targets:
            found = re.match(r"https?://github\.com/[^/]+/[^/]+/([^/?#]+)", target)
            if found:
                with self.subTest(target=target):
                    self.assertNotIn(found.group(1), own)


if __name__ == "__main__":
    unittest.main()
