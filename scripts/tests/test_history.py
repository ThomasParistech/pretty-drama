"""The upload journals, each play's own plus the root one: the project's only error
channel, its shape a contract with `filesOf` / `detailOf` (dashboard/App.tsx).
`history-example.json` is the fixture and the file to copy into `data/` in dev."""

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
        updated = add_run({"runs": [], "scriptHash": "abc"}, SCRIPT, "2026-07-27T10:00:00Z")
        self.assertNotIn("scriptHash", updated)


class TestExampleJournal(unittest.TestCase):
    """The shape contract with the front, on an example covering every display case."""

    FILE_KEYS = {"file", "kind", "clips", "error", "changes"}
    KINDS = {"voix", "script", "inconnu"}
    # A FIXTURE check; the two-sided contract is TestScriptDiffFields (contracts).
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
    # Flags, not counts: `changesOf` reads the value TYPE to decide on `{count}`.
    CHANGE_FLAGS = {"title", "language", "other", "created"}

    def test_runs_are_newest_first(self):
        dates = [run["at"] for run in EXAMPLE["runs"]]
        # ISO to the second with Z, so lexicographic order is chronological.
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
                self.assertIsInstance(file["clips"], int)
            else:
                self.assertNotIn("clips", file)
                self.assertIsInstance(file["changes"], dict)

    def test_a_refused_file_publishes_no_diff_either(self):
        # A diff beside a failure would read as a promotion that happened.
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
                    # Zeros are omitted: the front treats a missing count as none.
                    self.assertIsInstance(value, int)
                    self.assertGreater(value, 0)

    def test_the_example_covers_every_display_case(self):
        files = self.files()
        self.assertTrue(any(f["kind"] == "voix" and "clips" in f for f in files))
        self.assertTrue(any(f["kind"] == "voix" and "error" in f for f in files))
        self.assertTrue(any(f["kind"] == "script" and "error" not in f for f in files))
        self.assertTrue(any(len(run["files"]) > 1 for run in EXAMPLE["runs"]))
        # Every shape a script row can take: counts, flags, catch-all, birth, no-op.
        self.assertTrue(any(isinstance(v, int) for f in files for v in f.get("changes", {}).values()))
        self.assertTrue(any(f.get("changes", {}).get("title") for f in files))
        self.assertTrue(any(f.get("changes", {}).get("other") for f in files))
        self.assertTrue(any(f.get("changes", {}).get("created") for f in files))
        self.assertTrue(any(f.get("changes") == {} for f in files))

    def test_the_example_is_a_journal_add_run_could_have_written(self):
        # The Action's function and the example cannot diverge without failing here.
        updated = add_run(EXAMPLE, VOIX, "2026-07-28T10:00:00Z")
        self.assertEqual(updated["runs"][1:], EXAMPLE["runs"])
        self.assertEqual(set(updated), {"runs"})

    def files(self):
        return [file for run in EXAMPLE["runs"] for file in run["files"]]


class TestMain(unittest.TestCase):
    """One journal per play, plus a root one so a file no play claims never vanishes."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.plays = Path(self.tmp.name) / "plays"
        self.root_history = Path(self.tmp.name) / "history.json"
        self.result_path = Path(self.tmp.name) / "uploads_result.json"

    def run_main(self, result):
        """Write an uploads_result.json, run main(), return (per-play, root)."""
        if result is not None:
            self.result_path.write_text(json.dumps(result), encoding="utf-8")
        else:
            self.result_path.unlink(missing_ok=True)
        # `play_data_dir` re-reads `common.PLAYS_DIR` on every call.
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
        self.assertIsNone(root)  # this upload found its play

    def test_two_plays_get_two_journals_and_the_same_stamp(self):
        # One upload, two plays: a differing date would report two that never happened.
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
        # Failing here would commit uploads already merged without logging them.
        for bad in ({"plays": "nope", "unrouted": "nope"}, [1, 2, 3], {"plays": {"x": "nope"}}):
            journals, root = self.run_main(bad)
            self.assertEqual(journals, {})
            self.assertIsNone(root)


if __name__ == "__main__":
    unittest.main()
