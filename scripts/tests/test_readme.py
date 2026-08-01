"""What README.md has to keep true, because nothing at runtime would notice.

The README is the only page a coordinator reads before the site exists, and it
is COPIED VERBATIM into every troupe's repository by "Use this template". So it
carries two things that cannot be written as a literal: the address of the
site, filled in after each deployment (`ci/update_readme_urls.py`), and every
link into GitHub, written relative so it resolves against the reader's own copy.

Both fail silently. The address freezes if the marker goes (the script exits 0
by design, a fork may rewrite its front page), and a relative link at the wrong
depth still renders, still looks like a link, and quietly sends a troupe to a
404 or, worse, to this repository instead of theirs.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ci"))

from common import DEV_PLAY_ID
from update_readme_urls import MARKER, README, normalize

# Markdown inline links, `[text](target)`. Enough for this file, which has no
# reference-style links and no image.
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")


class TestSiteAddress(unittest.TestCase):
    def setUp(self):
        self.text = README.read_text(encoding="utf-8")

    def test_carries_exactly_one_marker(self):
        self.assertEqual(len(MARKER.findall(self.text)), 1)

    def test_the_recorded_address_is_one_the_script_would_write(self):
        recorded = MARKER.search(self.text).group(1)
        self.assertEqual(normalize(recorded), recorded)

    def test_the_prose_actually_names_the_recorded_address(self):
        # Otherwise a deployment would update the marker and nothing visible.
        recorded = MARKER.search(self.text).group(1)
        self.assertGreaterEqual(self.text.count(recorded), 2)

    def test_the_three_addresses_are_all_built_on_the_recorded_one(self):
        """Chooser, management, test bench.

        Each is the recorded address plus a suffix, which is the ONLY reason a
        deployment updates all three: the script substitutes one string. Write
        one of them differently and it silently keeps the old site's address
        while its two neighbours move.
        """
        base = MARKER.search(self.text).group(1)
        for suffix in ("", "respo.html", f"plays/{DEV_PLAY_ID}/respo.html"):
            with self.subTest(suffix=suffix):
                self.assertIn(f"<{base}{suffix}>", self.text)

    def test_the_test_bench_address_is_the_one_the_dev_server_opens(self):
        # `plays/<id>/respo.html`, same as scripts/dev.sh (test_contracts.py holds
        # that side). Hard-coding `dev` here would let a renamed DEV_PLAY_ID leave
        # a 404 in the README of every troupe.
        self.assertIn(f"plays/{DEV_PLAY_ID}/respo.html", self.text)


class TestGitHubLinks(unittest.TestCase):
    """A root README renders at `/<owner>/<repo>/blob/<branch>/README.md`.

    So `../../x` is `/<owner>/<repo>/x`, in whichever copy is being read, and
    that is the only way this file can point at the reader's own repository. The
    depth is the whole contract: one `../` too few or too many resolves
    somewhere else entirely.
    """

    def setUp(self):
        text = README.read_text(encoding="utf-8")
        self.targets = [t for t in LINK.findall(text) if t.startswith(".")]

    def test_there_are_relative_links_to_check(self):
        # Guards the rest of this class against a regex that stopped matching.
        self.assertGreater(len(self.targets), 3)

    def test_every_relative_link_climbs_exactly_two_levels(self):
        for target in self.targets:
            with self.subTest(target=target):
                self.assertTrue(target.startswith("../../"), "wrong depth")
                self.assertFalse(target[len("../../"):].startswith("../"), "too deep")

    def test_no_relative_link_names_a_branch(self):
        # `/<owner>/<repo>/tree/main/...` would pin the branch, and these links
        # exist precisely to assume nothing about the copy they are read in.
        for target in self.targets:
            with self.subTest(target=target):
                rest = target[len("../../"):]
                self.assertNotIn("main", rest.split("/"))

    def test_no_absolute_link_to_this_very_repository(self):
        # The mistake this whole scheme exists to prevent: a troupe clicking
        # "Settings" in their README and landing in the template's repository.
        text = README.read_text(encoding="utf-8")
        for target in LINK.findall(text):
            with self.subTest(target=target):
                self.assertNotRegex(target, r"github\.com/[^/]+/pretty-drama")


if __name__ == "__main__":
    unittest.main()
