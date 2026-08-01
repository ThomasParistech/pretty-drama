"""What README.md has to keep true, because nothing at runtime would notice.

The README is the only page a coordinator reads before the site exists, and it
is COPIED VERBATIM into every troupe's repository by "Use this template". So the
links it carries cannot be written as literals: the site's address is built from
the owner and the repository name, both unknown here. Each one is a placeholder
plus an invisible `<!-- ref: SITE_… -->`, and `ci/update_readme_urls.py` fills
them in after every deployment.

That fails silently. A ref that stops matching leaves a link on `example.com`
that renders exactly like a working one.

**These tests run inside build.yml, so inside EVERY copy, where a failure fails
that troupe's deployment.** That bounds what they may assert: only what stays
true when a troupe edits their own front page, which is theirs to edit. So
absence is never an error here. Removing a link is allowed and rewriting the
prose is allowed. What IS checked is that whatever remains is coherent, and
that the script and this file still agree on the set of refs. The cost is that
an accidental deletion
upstream goes unnoticed; the alternative was breaking the deploy of troupes who
did nothing wrong.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ci"))

from update_readme_urls import LINK, PATHS, README, SITE_URL, update

# Any `ref:` comment, ours or not, so a ref that stopped being matched by LINK
# (a stray space, a renamed namespace) is visible here instead of vanishing.
ANY_REF = re.compile(r"<!--\s*ref:\s*([A-Za-z0-9_]+)\s*-->")

TEXT = README.read_text(encoding="utf-8")
REFS = [match.group(4) for match in LINK.finditer(TEXT)]


class TestTheRegexItself(unittest.TestCase):
    """Guards the pattern everything below trusts.

    A README it cannot parse any more would make every other test here pass
    vacuously, and that is the failure nobody sees.
    """

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
        # The one thing that must never be wrong: an unknown SITE_ ref stops the
        # deployment's README step, so it would be caught late and loudly instead
        # of here.
        for ref in REFS:
            with self.subTest(ref=ref):
                self.assertIn(ref, PATHS)

    def test_no_site_ref_was_left_unmatched_by_the_link_pattern(self):
        # A ref the script cannot see is a link that never updates. This catches
        # the shapes LINK deliberately does not match, e.g. a ref on its own line.
        loose = [r for r in ANY_REF.findall(TEXT) if r.startswith("SITE_")]
        self.assertEqual(sorted(loose), sorted(REFS))

    def test_each_ref_appears_at_most_once(self):
        # Allowed by the script, but in this README a duplicate means a copy-paste.
        self.assertEqual(len(REFS), len(set(REFS)))

    def test_the_troupe_and_management_links_are_both_there(self):
        # The two a coordinator cannot work without, and the ones the run summary
        # promises are written here. Also the whole of PATHS, so a ref added to the
        # script without a link in the README shows up as a failure rather than as
        # a feature nobody can see.
        self.assertEqual(sorted(REFS), sorted(PATHS))

    def test_every_ref_target_is_an_absolute_address(self):
        """Placeholder or real, it has to be a URL.

        A relative target here would render as a link into the REPOSITORY rather
        than the site, and the script would happily overwrite it either way.
        """
        for match in LINK.finditer(TEXT):
            with self.subTest(ref=match.group(4)):
                self.assertTrue(SITE_URL.fullmatch(match.group(2)), match.group(2))

    def test_a_deployment_would_rewrite_every_one_of_them(self):
        """The end-to-end check, run against the real file.

        Everything above is structure; this is the behaviour. It proves each
        link lands on its own page of one site, and that a second deployment
        would change nothing.
        """
        site = "https://troupe.github.io/piece/"
        out = update(TEXT, site)
        for ref in REFS:
            with self.subTest(ref=ref):
                self.assertIn(f"]({site}{PATHS[ref]})", out)
        self.assertIsNone(update(out, site))


class TestGitHubLinks(unittest.TestCase):
    """Links into GitHub are RELATIVE, so they resolve against the reader's copy.

    A root README renders at `/<owner>/<repo>/blob/<branch>/README.md`, so
    `../../x` is `/<owner>/<repo>/x` in whichever copy is being read. The depth
    is the whole contract: one `../` too few or too many resolves somewhere else.
    Nothing requires such a link to EXIST; these hold the ones that do.
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
        # `/<owner>/<repo>/tree/main/...` would pin the branch, and these links
        # exist precisely to assume nothing about the copy they are read in.
        for target in self.relative:
            with self.subTest(target=target):
                self.assertNotIn("main", target[len("../../"):].split("/"))

    def test_no_absolute_link_to_a_page_of_ones_own_repository(self):
        # The mistake this scheme exists to prevent: a troupe clicking "Settings"
        # in their README and landing in somebody else's repository. Only these
        # pages are forbidden absolutely; a fork linking to the original project
        # to credit it is doing something legitimate.
        own = ("settings", "actions", "deployments", "issues", "pulls")
        for target in self.targets:
            found = re.match(r"https?://github\.com/[^/]+/[^/]+/([^/?#]+)", target)
            if found:
                with self.subTest(target=target):
                    self.assertNotIn(found.group(1), own)


if __name__ == "__main__":
    unittest.main()
