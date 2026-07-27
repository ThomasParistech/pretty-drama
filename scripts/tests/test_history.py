"""Tests du journal des dépôts affiché par la page Avancement.

C'est le SEUL canal d'erreur du projet (ni issue ni statut README), donc une
entrée perdue est une erreur que le respo ne verra jamais, et sa forme est un
contrat avec le front (`filesOf` / `detailOf` dans src/dashboard/App.jsx).

`history-example.json` est le journal d'exemple partagé : jeu de test ici, et
fichier à copier dans `data/` pour voir la page peuplée en dev. Il est donc tenu
d'être exactement ce que l'Action écrit et ce que le front lit."""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

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
        # scriptHash a disparu avec le dépôt direct dans data/ : la promotion du
        # script est désormais un fichier du journal, pas une empreinte déduite.
        updated = add_run({"runs": [], "scriptHash": "abc"}, SCRIPT, "2026-07-27T10:00:00Z")
        self.assertNotIn("scriptHash", updated)


class TestExampleJournal(unittest.TestCase):
    """Le contrat de forme avec le front, vérifié sur l'exemple partagé : il
    couvre exprès les quatre cas que la page sait afficher (voix réussies, voix
    refusée, script promu, plusieurs fichiers dans un même dépôt)."""

    FILE_KEYS = {"file", "kind", "clips", "error"}
    KINDS = {"voix", "script", "inconnu"}

    def test_runs_are_newest_first(self):
        dates = [run["at"] for run in EXAMPLE["runs"]]
        # Format ISO à la seconde suffixé Z, donc l'ordre lexicographique est
        # l'ordre chronologique (et `new Date()` le lit tel quel côté front).
        self.assertTrue(all(d.endswith("Z") for d in dates))
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_every_run_has_a_date_and_files(self):
        for run in EXAMPLE["runs"]:
            self.assertEqual(set(run), {"at", "files"})
            self.assertTrue(run["files"], "un dépôt sans fichier ne devrait pas être consigné")

    def test_every_file_carries_a_known_kind_and_nothing_unexpected(self):
        for file in self.files():
            self.assertLessEqual(set(file), self.FILE_KEYS)
            self.assertIn(file["kind"], self.KINDS)
            self.assertIsInstance(file["file"], str)

    def test_success_and_failure_are_exclusive(self):
        for file in self.files():
            if "error" in file:
                self.assertNotIn("clips", file, "un fichier refusé n'a publié aucune réplique")
                self.assertIsInstance(file["error"], str)
            elif file["kind"] == "voix":
                # detailOf compte les répliques d'un ZIP réussi.
                self.assertIsInstance(file["clips"], int)
            else:
                # Un script promu n'a rien à ajouter : le sceau le dit.
                self.assertNotIn("clips", file)

    def test_the_example_covers_the_four_display_cases(self):
        files = self.files()
        self.assertTrue(any(f["kind"] == "voix" and "clips" in f for f in files))
        self.assertTrue(any(f["kind"] == "voix" and "error" in f for f in files))
        self.assertTrue(any(f["kind"] == "script" and "error" not in f for f in files))
        self.assertTrue(any(len(run["files"]) > 1 for run in EXAMPLE["runs"]))

    def test_the_example_is_a_journal_add_run_could_have_written(self):
        # Empilé sur lui-même, il reste bien formé : la fonction de l'Action et
        # le fichier d'exemple ne peuvent pas diverger sans casser ce test.
        updated = add_run(EXAMPLE, VOIX, "2026-07-28T10:00:00Z")
        self.assertEqual(updated["runs"][1:], EXAMPLE["runs"])
        self.assertEqual(set(updated), {"runs"})

    def files(self):
        return [file for run in EXAMPLE["runs"] for file in run["files"]]


class TestMain(unittest.TestCase):
    """Le script tel que le workflow l'appelle, sur de vrais fichiers."""

    def run_main(self, tmp, result):
        """Écrit un uploads_result.json puis joue main() sur un journal du dossier
        temporaire. Retourne le journal écrit (ou None s'il n'a rien écrit)."""
        history = Path(tmp) / "history.json"
        result_path = Path(tmp) / "uploads_result.json"
        if result is not None:
            result_path.write_text(json.dumps(result), encoding="utf-8")
        with mock.patch.object(update_history, "HISTORY_PATH", history), mock.patch.object(
            update_history, "RESULT_PATH", result_path
        ), redirect_stdout(io.StringIO()):
            update_history.main()
        return json.loads(history.read_text(encoding="utf-8")) if history.exists() else None

    def test_a_deposit_is_appended_with_a_utc_stamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal = self.run_main(tmp, VOIX + SCRIPT)
            self.assertEqual(journal["runs"][0]["files"], VOIX + SCRIPT)
            self.assertRegex(journal["runs"][0]["at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

    def test_nothing_is_written_when_no_file_was_deposited(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(self.run_main(tmp, []))
            # Résultat absent (le workflow a sauté le traitement) : idem.
            self.assertIsNone(self.run_main(tmp, None))

    def test_an_unreadable_journal_is_not_a_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "history.json").write_text("{pas du json", encoding="utf-8")
            journal = self.run_main(tmp, VOIX)
            self.assertEqual(len(journal["runs"]), 1)


if __name__ == "__main__":
    unittest.main()
