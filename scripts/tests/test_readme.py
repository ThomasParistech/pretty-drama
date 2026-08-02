"""README.md invariants. The site's address is NOT in this file and is never written
into it: GitHub shows it on Settings > Pages and in the About panel, neither of which
can drift. What is left to hold is the links into GitHub, which must resolve against
the reader's OWN copy. Runs in every copy of the template, so absence is never an
error here."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

README = Path(__file__).resolve().parent.parent.parent / "README.md"
TEXT = README.read_text(encoding="utf-8")

# The two routes that REQUIRE a real branch in the path: `/new/<branch>` and
# `/upload/<branch>` answer with the repository home page when it does not exist
# (measured, cf. BRANCH in shared/data.js), so they name one on purpose. Every other
# route resolves without a branch, where naming one is the fork-renamed-its-default
# trap. test_contracts.py holds the branch these two carry to that same constant.
BRANCH_ROUTES = ("new/", "upload/")


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
            path = target[len("../../"):]
            if path.startswith(BRANCH_ROUTES):
                continue
            with self.subTest(target=target):
                self.assertNotIn("main", path.split("/"))

    def test_no_absolute_link_to_a_page_of_ones_own_repository(self):
        # Prevents a troupe clicking "Settings" and landing in another repo; only
        # these pages, since crediting the original project is legitimate.
        # `new` and `upload` are the severe ones: absolute, they do not merely show
        # the wrong repository, they COMMIT the troupe's play or voices into it.
        own = ("settings", "actions", "deployments", "issues", "pulls", "new", "upload")
        for target in self.targets:
            found = re.match(r"https?://github\.com/[^/]+/[^/]+/([^/?#]+)", target)
            if found:
                with self.subTest(target=target):
                    self.assertNotIn(found.group(1), own)


if __name__ == "__main__":
    unittest.main()
