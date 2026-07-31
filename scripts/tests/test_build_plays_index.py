"""Tests for data/plays.json, the only file sitting above the plays.

Two things it must never do, both of them costing the coordinator their way back in:
lose a play whose manifest is damaged (the chooser would no longer link to it, and
its upload area is reached through it), and crash on a hand-edited manifest (the file
is committed, hence editable in the repository like every file the pages read).

`count_words` is the TWIN of `countWords` (src/stats/stats.js): the chooser writes a
word count on the very play whose Speaking share page breaks that same count down per
character, so the two tokenisers must cut alike. Its cases below therefore mirror
those of `src/stats/stats.test.js`."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common
from build_plays_index import count_words, play_entry

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

    def test_it_returns_zero_on_anything_that_is_not_a_text(self):
        for raw in (None, 42, [], {}, ""):
            self.assertEqual(count_words(raw), 0, f"input: {raw!r}")


class TestPlayEntry(unittest.TestCase):
    """One entry, read on real files and in degraded mode."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.plays = Path(self.tmp.name) / "plays"

    def entry(self, manifest, play_id="le-malade"):
        """Writes a manifest (a string is written verbatim, to forge a damaged file,
        and None writes nothing at all) then reads the entry back.

        `PLAYS_DIR` is patched in common, where `play_data_dir` re-reads it on every
        call: that is what moves the play folders into the test folder."""
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
        # 7 + 3 + 2, `count_words` splitting on the apostrophe ("J'suis" is two).
        self.assertEqual(entry["words"], 12)
        self.assertEqual(entry["lines"], 3)
        self.assertEqual(entry["recorded"], 1)

    def test_the_cast_is_the_manifests_list_not_the_characters_who_speak(self):
        # A character written but not yet given a line is still a role to hand out,
        # and that is what the card counts.
        manifest = {**MANIFEST, "characters": MANIFEST["characters"] + [{"id": "c-x", "name": "X"}]}
        self.assertEqual(self.entry(manifest)["characters"], 3)

    def test_a_missing_manifest_still_gives_an_entry(self):
        # The worst display is a play VANISHING: the coordinator would have no path
        # left to its upload area to repair it.
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
        # The card no longer says when the last upload happened: that date is read in
        # each play's own log, on its Progress page, next to what it explains.
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
                # `Majuscule` is not a valid play id, so it names no play: the order
                # is by id and the front end is what sorts by title.
                self.assertEqual(common.play_ids(), ["malade", "transport", "zebre"])


if __name__ == "__main__":
    unittest.main()
