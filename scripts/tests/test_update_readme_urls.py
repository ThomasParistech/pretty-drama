"""Site links written into the README after a deployment."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ci"))

from update_readme_urls import PATHS, normalize, update

SITE = "https://troupe.github.io/piece/"


class TestNormalize(unittest.TestCase):
    def test_adds_the_trailing_slash(self):
        # PATHS are appended to this.
        self.assertEqual(
            normalize("https://x.github.io/troupe"), "https://x.github.io/troupe/"
        )

    def test_keeps_a_single_trailing_slash(self):
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
    def test_points_each_ref_at_its_own_page(self):
        text = (
            "[La troupe](https://example.com) <!-- ref: SITE_HOME -->\n"
            "[La gestion](https://example.com) <!-- ref: SITE_RESPO -->\n"
        )
        out = update(text, SITE)
        self.assertIn(f"[La troupe]({SITE}) <!-- ref: SITE_HOME -->", out)
        self.assertIn(f"[La gestion]({SITE}respo.html) <!-- ref: SITE_RESPO -->", out)

    def test_is_idempotent(self):
        text = "[x](https://example.com) <!-- ref: SITE_HOME -->\n"
        once = update(text, SITE)
        self.assertIsNone(update(once, SITE))

    def test_the_display_text_is_never_touched(self):
        # French prose belongs to the README; the script owns targets only.
        text = "[Le site de la troupe](https://example.com) <!-- ref: SITE_HOME -->\n"
        self.assertIn("[Le site de la troupe](", update(text, SITE))

    def test_a_link_with_no_ref_is_left_alone(self):
        text = (
            "[La troupe](https://example.com) <!-- ref: SITE_HOME -->\n"
            "[Licence](LICENSE) et [amis](https://example.com/autre).\n"
        )
        out = update(text, SITE)
        self.assertIn("[Licence](LICENSE)", out)
        self.assertIn("[amis](https://example.com/autre)", out)

    def test_a_ref_outside_the_site_namespace_is_not_ours(self):
        # A fork may use the same comment syntax for its own purposes.
        text = (
            "[a](https://example.com) <!-- ref: SITE_HOME -->\n"
            "[b](https://example.com) <!-- ref: PATH_A_001 -->\n"
        )
        out = update(text, SITE)
        self.assertIn("[b](https://example.com) <!-- ref: PATH_A_001 -->", out)

    def test_the_same_ref_twice_updates_both(self):
        text = (
            "[a](https://example.com) <!-- ref: SITE_HOME -->\n"
            "et encore [b](https://example.com) <!-- ref: SITE_HOME -->\n"
        )
        self.assertEqual(update(text, SITE).count(f"]({SITE})"), 2)

    def test_an_empty_target_is_filled_in(self):
        text = "[x]() <!-- ref: SITE_RESPO -->\n"
        self.assertIn(f"[x]({SITE}respo.html)", update(text, SITE))

    def test_a_readme_with_no_refs_is_left_alone(self):
        self.assertIsNone(update("# Ma troupe\n[x](https://y.test)\n", SITE))

    def test_an_unknown_site_ref_stops_the_run(self):
        # Skipping a typo would strand a link on example.com in every copy.
        text = "[x](https://example.com) <!-- ref: SITE_TYPO -->\n"
        with self.assertRaises(ValueError):
            update(text, SITE)

    def test_nothing_is_returned_when_it_refuses(self):
        # `update` is pure: main() writes only what it hands back.
        text = "[x](https://example.com) <!-- ref: SITE_TYPO -->\n"
        before = text
        with self.assertRaises(ValueError):
            update(text, SITE)
        self.assertEqual(text, before)


class TestPaths(unittest.TestCase):
    def test_home_is_the_site_root(self):
        self.assertEqual(PATHS["SITE_HOME"], "")

    def test_no_path_starts_with_a_slash(self):
        for ref, path in PATHS.items():
            with self.subTest(ref=ref):
                self.assertFalse(path.startswith("/"))


if __name__ == "__main__":
    unittest.main()
