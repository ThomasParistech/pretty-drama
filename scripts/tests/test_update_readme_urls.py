"""The site address written into the README after a deployment.

This runs once per copy of the template and then never again, which is exactly
the kind of code nobody notices has rotted. And it is the only thing standing
between a fresh copy and a README that names, credibly, someone else's site.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ci"))

from update_readme_urls import MARKER, normalize, update

MARK = "<!-- prettydrama:site https://old.github.io/troupe/ -->"


class TestNormalize(unittest.TestCase):
    def test_adds_the_trailing_slash(self):
        self.assertEqual(
            normalize("https://x.github.io/troupe"), "https://x.github.io/troupe/"
        )

    def test_keeps_a_single_trailing_slash(self):
        # deploy-pages already answers with one, and a slash coming and going
        # would rewrite the whole README for nothing.
        self.assertEqual(
            normalize("https://x.github.io/troupe/"), "https://x.github.io/troupe/"
        )

    def test_strips_surrounding_whitespace(self):
        self.assertEqual(normalize("  https://x.github.io/t/\n"), "https://x.github.io/t/")

    def test_refuses_what_is_not_an_address(self):
        for bad in ("", "   ", "x.github.io/troupe", "javascript:alert(1)",
                    "https://x.github.io/a b", "https://x.github.io/-->"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                normalize(bad)


class TestUpdate(unittest.TestCase):
    def test_rewrites_every_mention_and_the_marker(self):
        text = (
            f"{MARK}\n"
            "Le site : <https://old.github.io/troupe/>\n"
            "La gestion : <https://old.github.io/troupe/respo.html>\n"
        )
        out = update(text, "https://new.github.io/autre/")
        self.assertNotIn("old.github.io", out)
        self.assertIn("<https://new.github.io/autre/respo.html>", out)
        # The marker follows, so the next run has the current address to compare.
        self.assertEqual(MARKER.search(out).group(1), "https://new.github.io/autre/")

    def test_is_idempotent(self):
        text = f"{MARK}\nLe site : <https://old.github.io/troupe/>\n"
        once = update(text, "https://new.github.io/autre/")
        self.assertIsNone(update(once, "https://new.github.io/autre/"))

    def test_leaves_a_readme_without_the_marker_alone(self):
        self.assertIsNone(update("# Ma troupe\n", "https://new.github.io/autre/"))

    def test_touches_nothing_else(self):
        text = f"{MARK}\nVoir <https://github.com/old/troupe> et `plays/troupe/`.\n"
        out = update(text, "https://new.github.io/autre/")
        self.assertIn("<https://github.com/old/troupe>", out)
        self.assertIn("`plays/troupe/`", out)


if __name__ == "__main__":
    unittest.main()
