"""data/plays.json: never lose or crash on a play whose manifest is damaged.
`count_words` twins `countWords` (stats.ts); its cases mirror stats.test.ts."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common
from build_plays_index import count_words, listed_play_ids, play_entry

MANIFEST = {
    "id": "le-malade",
    "title": "Le Malade imaginaire",
    "language": "fr",
    "characters": [
        {"id": "c-serge", "name": "Serge"},
        {"id": "c-annie", "name": "Annie"},
    ],
    "lines": [
        {"id": "l1", "text": "Silence ! C'est moi le chef ici.", "status": "ok"},
        {"id": "l2", "text": "J'suis malade.", "status": "perime"},
        {"id": "l3", "text": "Nouveau texte.", "status": "manquant"},
    ],
}


class TestCountWords(unittest.TestCase):
    def test_it_splits_like_the_reference_apostrophes_included(self):
        self.assertEqual(count_words("Silence! C'est moi le chef ici."), 7)
        self.assertEqual(count_words("Mettez‑vous ça dans l'crâne."), 6)
        self.assertEqual(count_words("un"), 1)

    def test_it_ignores_punctuation_and_counts_accents_as_letters(self):
        self.assertEqual(count_words("... !? -- «»"), 0)
        self.assertEqual(count_words("Éléonore où être"), 3)
        self.assertEqual(count_words("Acte 2 scène 10"), 4)

    def test_the_underscore_separates_here_as_it_does_on_the_front(self):
        # The one place `\w` and `[\p{L}\p{N}]` disagree, so the mirrored case in
        # stats.test.ts is what this asserts against.
        self.assertEqual(count_words("a_b"), 2)

    def test_it_returns_zero_on_anything_that_is_not_a_text(self):
        for raw in (None, 42, [], {}, ""):
            self.assertEqual(count_words(raw), 0, f"input: {raw!r}")


class TestPlayEntry(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.plays = Path(self.tmp.name) / "plays"

    def entry(self, manifest, play_id="le-malade"):
        """Write a manifest (str verbatim to forge a damaged file, None writes none)
        then read the entry back."""
        data = self.plays / play_id / "data"
        data.mkdir(parents=True, exist_ok=True)
        if manifest is not None:
            raw = manifest if isinstance(manifest, str) else json.dumps(manifest)
            (data / "manifest.json").write_text(raw, encoding="utf-8")
        with mock.patch.object(common, "PLAYS_DIR", self.plays):
            return play_entry(play_id)

    def test_a_whole_manifest_gives_the_two_figures_a_card_leads_with(self):
        entry = self.entry(MANIFEST)
        self.assertEqual(entry["title"], "Le Malade imaginaire")
        self.assertEqual(entry["language"], "fr")
        self.assertEqual(entry["characters"], 2)
        # 7 + 3 + 2, splitting on the apostrophe ("J'suis" is two).
        self.assertEqual(entry["words"], 12)
        self.assertEqual(entry["lines"], 3)
        self.assertEqual(entry["recorded"], 1)

    def test_the_cast_is_the_manifests_list_not_the_characters_who_speak(self):
        # A character with no line yet is still a role to hand out.
        manifest = {**MANIFEST, "characters": MANIFEST["characters"] + [{"id": "c-x", "name": "X"}]}
        self.assertEqual(self.entry(manifest)["characters"], 3)

    def test_a_missing_manifest_still_gives_an_entry(self):
        # A vanished play leaves no path to its upload area to repair it.
        entry = self.entry(None)
        self.assertEqual(entry["id"], "le-malade")
        self.assertEqual(entry["title"], "")
        self.assertEqual(entry["language"], "fr")
        self.assertEqual((entry["characters"], entry["words"]), (0, 0))
        self.assertEqual((entry["lines"], entry["recorded"]), (0, 0))

    def test_a_damaged_or_hand_edited_manifest_never_raises(self):
        for manifest in (
            "{ not json",
            "[]",
            '"a string"',
            {"title": 42, "language": [], "characters": "Serge", "lines": {}},
            {"lines": [None, 42, "x", {"text": None}, {"text": [], "status": "ok"}]},
        ):
            entry = self.entry(manifest)
            self.assertEqual(entry["id"], "le-malade")
            self.assertIsInstance(entry["title"], str)
            self.assertIsInstance(entry["characters"], int)
            self.assertIsInstance(entry["words"], int)
            self.assertEqual(entry["words"], 0, f"manifest: {manifest!r}")

    def test_nothing_of_the_journal_reaches_the_index(self):
        entry = self.entry(MANIFEST)
        self.assertEqual(
            set(entry), {"id", "title", "language", "characters", "words", "lines", "recorded"}
        )


class TestPlayList(unittest.TestCase):
    def test_the_list_comes_from_the_folders_and_is_ordered_by_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            plays = Path(tmp) / "plays"
            for name in ("zebre", "malade", "Majuscule", "transport"):
                (plays / name / "data").mkdir(parents=True)
            with mock.patch.object(common, "PLAYS_DIR", plays):
                # `Majuscule` is no play id; order is by id, the front sorts by title.
                self.assertEqual(common.play_ids(), ["malade", "transport", "zebre"])

    def test_the_test_bench_is_a_play_everywhere_but_in_the_list(self):
        # Built and deployed like any play; only the root pages must not offer it.
        with tempfile.TemporaryDirectory() as tmp:
            plays = Path(tmp) / "plays"
            for name in (common.DEV_PLAY_ID, "malade", "transport"):
                (plays / name / "data").mkdir(parents=True)
            with mock.patch.object(common, "PLAYS_DIR", plays):
                self.assertIn(common.DEV_PLAY_ID, common.play_ids())
                self.assertEqual(listed_play_ids(), ["malade", "transport"])


if __name__ == "__main__":
    unittest.main()
