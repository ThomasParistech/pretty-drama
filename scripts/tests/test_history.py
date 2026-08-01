"""Tests for the upload journals: each play's own (rendered by its Dashboard) and the
root one (rendered by the play management page).

It is the ONLY error channel of the project (no issue, no README status), so a lost
entry is an error the coordinator will never see, and its shape is a contract with the
front end (`filesOf` / `detailOf` in src/dashboard/App.jsx).

`history-example.json` is the shared example journal: a test fixture here, and the
file to copy into `data/` to see the page populated in dev. It is therefore bound to
be exactly what the Action writes and what the front end reads."""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common
import update_history
from update_history import MAX_RUNS, add_run

EXAMPLE_PATH = Path(__file__).resolve().parent / "history-example.json"
EXAMPLE = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))

VOIX = [{"file": "voix-serge.zip", "kind": "voix", "clips": 3}]
SCRIPT = [{"file": "script.json", "kind": "script"}]
REFUSE = [{"file": "voix-lea.zip", "kind": "voix", "error": "le fichier n'est pas un ZIP valide"}]


def entry(n):
    return {"at": f"2026-07-2{n}T10:00:00Z", "files": []}


class TestAddRun(unittest.TestCase):
    def test_new_entry_comes_first(self):
        history = {"runs": [entry(1)]}
        updated = add_run(history, VOIX, "2026-07-27T10:00:00Z")
        self.assertEqual(updated["runs"][0], {"at": "2026-07-27T10:00:00Z", "files": VOIX})
        self.assertEqual(updated["runs"][1], entry(1))

    def test_errors_are_kept_verbatim(self):
        updated = add_run({}, REFUSE, "2026-07-27T10:00:00Z")
        self.assertEqual(updated["runs"][0]["files"], REFUSE)

    def test_a_script_deposit_is_recorded_like_any_other_file(self):
        updated = add_run({}, SCRIPT, "2026-07-27T10:00:00Z")
        self.assertEqual(updated["runs"][0]["files"], SCRIPT)

    def test_oldest_entries_are_dropped_at_the_cap(self):
        history = {"runs": [entry(i % 10) for i in range(MAX_RUNS)]}
        updated = add_run(history, VOIX, "2026-07-27T10:00:00Z")
        self.assertEqual(len(updated["runs"]), MAX_RUNS)
        self.assertEqual(updated["runs"][0]["files"], VOIX)
        self.assertEqual(updated["runs"][1:], history["runs"][: MAX_RUNS - 1])

    def test_missing_or_malformed_journal_starts_over(self):
        for bad in ({}, {"runs": None}, {"runs": "nope"}, {"runs": 42}):
            updated = add_run(bad, VOIX, "2026-07-27T10:00:00Z")
            self.assertEqual(len(updated["runs"]), 1)

    def test_no_stale_script_hash_is_carried_over(self):
        # scriptHash went away with uploading straight into data/: promoting the
        # script is now a file in the journal, not an inferred fingerprint.
        updated = add_run({"runs": [], "scriptHash": "abc"}, SCRIPT, "2026-07-27T10:00:00Z")
        self.assertNotIn("scriptHash", updated)


class TestExampleJournal(unittest.TestCase):
    """The shape contract with the front end, checked on the shared example: it
    deliberately covers every case the page knows how to display (voices that succeeded,
    voices refused, a script promotion with its diff, one that changed nothing, the birth
    of the play, several files in one upload)."""

    FILE_KEYS = {"file", "kind", "clips", "error", "changes"}
    KINDS = {"voix", "script", "inconnu"}
    # The counts `script_changes` publishes, plus the flag `promote_script` adds. Written
    # out here because this class checks the EXAMPLE file, which is a fixture and not a
    # source: what holds the counts to the front that reads them is
    # `TestScriptDiffFields` in test_contracts.py, which reads both real sides.
    CHANGE_FIELDS = {
        "linesAdded",
        "linesRemoved",
        "linesEdited",
        "linesReassigned",
        "castAdded",
        "castRemoved",
        "castRenamed",
        "title",
        "language",
        "other",
        "created",
    }
    # The ones that are FLAGS and not counts: there is one title, one language, one birth,
    # and `other` is a yes or no. `changesOf` on the front reads the type of the value to
    # know whether to interpolate a `{count}`, so a flag written as a number (or the other
    # way round) renders the wrong sentence or none at all.
    CHANGE_FLAGS = {"title", "language", "other", "created"}

    def test_runs_are_newest_first(self):
        dates = [run["at"] for run in EXAMPLE["runs"]]
        # ISO format to the second, suffixed with Z, so lexicographic order is
        # chronological order (and `new Date()` reads it as is on the front end).
        self.assertTrue(all(d.endswith("Z") for d in dates))
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_every_run_has_a_date_and_files(self):
        for run in EXAMPLE["runs"]:
            self.assertEqual(set(run), {"at", "files"})
            self.assertTrue(run["files"], "an upload with no file should not be logged")

    def test_every_file_carries_a_known_kind_and_nothing_unexpected(self):
        for file in self.files():
            self.assertLessEqual(set(file), self.FILE_KEYS)
            self.assertIn(file["kind"], self.KINDS)
            self.assertIsInstance(file["file"], str)

    def test_success_and_failure_are_exclusive(self):
        for file in self.files():
            if "error" in file:
                self.assertNotIn("clips", file, "a refused file published no line at all")
                self.assertIsInstance(file["error"], str)
            elif file["kind"] == "voix":
                # detailOf counts the lines of a ZIP that succeeded.
                self.assertIsInstance(file["clips"], int)
            else:
                # A promoted script counts what it CHANGED instead: no clip merged, and
                # the diff `promote_script` took between the two versions.
                self.assertNotIn("clips", file)
                self.assertIsInstance(file["changes"], dict)

    def test_a_refused_file_publishes_no_diff_either(self):
        # Nothing was written, so there is nothing to have changed. The front would
        # render the reason anyway (the error wins over the detail), but a diff sitting
        # beside a failure in the repository would read as a promotion that happened.
        for file in self.files():
            if "error" in file:
                self.assertNotIn("changes", file)

    def test_a_diff_carries_only_known_fields_and_real_counts(self):
        for file in self.files():
            changes = file.get("changes")
            if changes is None:
                continue
            self.assertLessEqual(set(changes), self.CHANGE_FIELDS)
            for field, value in changes.items():
                if field in self.CHANGE_FLAGS:
                    self.assertIs(value, True)
                else:
                    # Zeros are OMITTED, not written: the entry reads by eye in the
                    # repository, and the front treats a missing count as none. A zero
                    # written out would also make an unchanged promotion look like a
                    # diff that found nothing rather than one that says so.
                    self.assertIsInstance(value, int)
                    self.assertGreater(value, 0)

    def test_the_example_covers_every_display_case(self):
        files = self.files()
        self.assertTrue(any(f["kind"] == "voix" and "clips" in f for f in files))
        self.assertTrue(any(f["kind"] == "voix" and "error" in f for f in files))
        self.assertTrue(any(f["kind"] == "script" and "error" not in f for f in files))
        self.assertTrue(any(len(run["files"]) > 1 for run in EXAMPLE["runs"]))
        # Every shape a script row can take, because each renders a different sentence and
        # the example is what a screenshot of this page is taken from: counts, flags, the
        # catch-all, the birth of the play, and the promotion that moved nothing.
        self.assertTrue(any(isinstance(v, int) for f in files for v in f.get("changes", {}).values()))
        self.assertTrue(any(f.get("changes", {}).get("title") for f in files))
        self.assertTrue(any(f.get("changes", {}).get("other") for f in files))
        self.assertTrue(any(f.get("changes", {}).get("created") for f in files))
        self.assertTrue(any(f.get("changes") == {} for f in files))

    def test_the_example_is_a_journal_add_run_could_have_written(self):
        # Stacked on top of itself, it stays well formed: the Action's function
        # and the example file cannot diverge without breaking this test.
        updated = add_run(EXAMPLE, VOIX, "2026-07-28T10:00:00Z")
        self.assertEqual(updated["runs"][1:], EXAMPLE["runs"])
        self.assertEqual(set(updated), {"runs"})

    def files(self):
        return [file for run in EXAMPLE["runs"] for file in run["files"]]


class TestMain(unittest.TestCase):
    """The script as the workflow calls it, on real files.

    One journal PER PLAY (a play ignores the other plays' uploads, as it ignores
    their lines), plus a ROOT journal for whatever no play claims. Without the
    latter, a file dropped with no readable identifier would vanish without a word,
    which is exactly what an error channel must never do."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.plays = Path(self.tmp.name) / "plays"
        self.root_history = Path(self.tmp.name) / "history.json"
        self.result_path = Path(self.tmp.name) / "uploads_result.json"

    def run_main(self, result):
        """Writes an uploads_result.json then runs main(). Returns the pair
        (per-play journals, root journal), each None if nothing was written."""
        if result is not None:
            self.result_path.write_text(json.dumps(result), encoding="utf-8")
        else:
            self.result_path.unlink(missing_ok=True)
        # `PLAYS_DIR` is patched in common, where `play_data_dir` re-reads it on
        # every call: that is what moves the play journals into the test folder.
        with mock.patch.object(common, "PLAYS_DIR", self.plays), mock.patch.multiple(
            update_history, ROOT_HISTORY_PATH=self.root_history, RESULT_PATH=self.result_path
        ), redirect_stdout(io.StringIO()):
            update_history.main()
        return self.journals(), self.read(self.root_history)

    def journals(self):
        return {
            path.parent.parent.name: self.read(path)
            for path in sorted(self.plays.glob("*/data/history.json"))
        }

    def read(self, path):
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def test_a_deposit_is_appended_to_its_own_play_with_a_utc_stamp(self):
        journals, root = self.run_main({"plays": {"le-malade": VOIX + SCRIPT}, "unrouted": []})
        self.assertEqual(set(journals), {"le-malade"})
        self.assertEqual(journals["le-malade"]["runs"][0]["files"], VOIX + SCRIPT)
        self.assertRegex(
            journals["le-malade"]["runs"][0]["at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"
        )
        # Nothing at the root: this upload found its play.
        self.assertIsNone(root)

    def test_two_plays_get_two_journals_and_the_same_stamp(self):
        # Two files uploaded together are ONE upload, even when they concern two
        # plays: the date must be the same on both sides, or the journal would
        # report two uploads that never happened.
        journals, _ = self.run_main(
            {"plays": {"le-malade": VOIX, "transport": SCRIPT}, "unrouted": []}
        )
        self.assertEqual(set(journals), {"le-malade", "transport"})
        self.assertEqual(journals["le-malade"]["runs"][0]["files"], VOIX)
        self.assertEqual(journals["transport"]["runs"][0]["files"], SCRIPT)
        self.assertEqual(
            journals["le-malade"]["runs"][0]["at"], journals["transport"]["runs"][0]["at"]
        )

    def test_what_no_play_claims_goes_to_the_root_journal(self):
        journals, root = self.run_main({"plays": {}, "unrouted": REFUSE})
        self.assertEqual(journals, {})
        self.assertEqual(root["runs"][0]["files"], REFUSE)

    def test_nothing_is_written_when_no_file_was_deposited(self):
        for result in ({"plays": {}, "unrouted": []}, {"plays": {"le-malade": []}}, {}, None):
            journals, root = self.run_main(result)
            self.assertEqual(journals, {})
            self.assertIsNone(root)

    def test_an_unreadable_journal_is_not_a_failure(self):
        data = self.plays / "le-malade" / "data"
        data.mkdir(parents=True)
        (data / "history.json").write_text("{pas du json", encoding="utf-8")
        journals, _ = self.run_main({"plays": {"le-malade": VOIX}, "unrouted": []})
        self.assertEqual(len(journals["le-malade"]["runs"]), 1)

    def test_a_malformed_result_is_not_a_failure(self):
        # uploads_result.json is machine-written, but the journal is a convenience:
        # an unexpected shape must not make the run fail, since it would then
        # commit without logging the uploads it has already merged.
        for bad in ({"plays": "nope", "unrouted": "nope"}, [1, 2, 3], {"plays": {"x": "nope"}}):
            journals, root = self.run_main(bad)
            self.assertEqual(journals, {})
            self.assertIsNone(root)


if __name__ == "__main__":
    unittest.main()
