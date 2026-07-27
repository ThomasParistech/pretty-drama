"""Status computation tests: ok / perime / manquant + orphan clips, plus la
recopie du journal des dépôts (manifest.json est le seul fichier lu par les
pages : ce que build_manifest n'y met pas n'existe pas pour le front)."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_manifest import build_manifest, sanitize_script

EXAMPLE_RUNS = json.loads(
    (Path(__file__).resolve().parent / "history-example.json").read_text(encoding="utf-8")
)["runs"]

# Ids are UUIDs minted by the editor; short strings here for readability.
L1, L2, L3 = "aaaa-1111", "bbbb-2222", "cccc-3333"
SERGE, NAPO = "char-serge", "char-napo"

SCRIPT = {
    "title": "Test",
    "characters": [{"id": SERGE, "name": "Serge"}, {"id": NAPO, "name": "Napo"}],
    "acts": [
        {
            "title": "Acte I",
            "scenes": [
                {
                    "title": "Scène 1",
                    "lines": [
                        {"id": L1, "characterId": SERGE, "text": "Silence! C'est moi le chef."},
                        {"id": L2, "characterId": NAPO, "text": "J'suis malade."},
                        {"id": L3, "characterId": SERGE, "text": "Nouveau texte, jamais enregistré."},
                    ],
                }
            ],
        }
    ],
}

# clips.json maps line id -> RAW text captured at recording time;
# normalization only happens at comparison time, in build_manifest.
CLIPS = {
    # cosmetically different from line 1 -> still ok after normalization
    "aaaa-1111": "SILENCE ; c'est moi le chef…",
    # genuinely different words from line 2 -> perime
    "bbbb-2222": "Je suis souffrant.",
    # orphan: id absent from the script -> absent from manifest
    "zzzz-9999": "Vieille réplique supprimée.",
}


class TestBuildManifest(unittest.TestCase):
    def setUp(self):
        self.manifest = build_manifest(SCRIPT, CLIPS)

    def status_of(self, line_id):
        return next(l for l in self.manifest["lines"] if l["id"] == line_id)

    def test_ok_when_normalized_text_matches(self):
        line = self.status_of(L1)
        self.assertEqual(line["status"], "ok")
        self.assertEqual(line["clip"], f"clips/{L1}.mp3")

    def test_perime_when_text_changed(self):
        line = self.status_of(L2)
        self.assertEqual(line["status"], "perime")
        self.assertEqual(line["clip"], f"clips/{L2}.mp3")

    def test_manquant_when_no_clip(self):
        line = self.status_of(L3)
        self.assertEqual(line["status"], "manquant")
        self.assertIsNone(line["clip"])

    def test_orphan_clip_not_served(self):
        self.assertNotIn("zzzz-9999", [l["id"] for l in self.manifest["lines"]])

    def test_character_name_resolved_from_id(self):
        self.assertEqual(self.status_of(L1)["character"], "Serge")
        self.assertEqual(self.status_of(L2)["character"], "Napo")

    def test_cosmetic_change_stays_ok(self):
        # Punctuation/case-only edit: normalization absorbs it.
        script = {**SCRIPT}
        script["acts"] = [
            {
                "title": "Acte I",
                "scenes": [
                    {
                        "title": "Scène 1",
                        "lines": [{"id": L1, "characterId": SERGE, "text": "SILENCE… c'est moi le CHEF ?!"}],
                    }
                ],
            }
        ]
        manifest = build_manifest(script, CLIPS)
        self.assertEqual(manifest["lines"][0]["status"], "ok")

    def test_acts_structure_enriched(self):
        line = self.manifest["acts"][0]["scenes"][0]["lines"][0]
        self.assertEqual(line["act"], "Acte I")
        self.assertEqual(line["scene"], "Scène 1")
        self.assertIn("status", line)


class TestMalformedScriptTolerance(unittest.TestCase):
    """script.json is hand-editable on github.com: malformed entries must be
    dropped (like the editor's sanitizeScript does), never crash the run."""

    def test_non_dict_root(self):
        for bad in (None, [], "x", 42):
            manifest = build_manifest(bad, {})
            self.assertEqual(manifest["lines"], [])

    def test_character_missing_keys_is_dropped(self):
        script = {
            "characters": [{"id": SERGE}, {"name": "SansId"}, {"id": NAPO, "name": "Napo"}, None],
            "acts": [],
        }
        manifest = build_manifest(script, {})
        self.assertEqual([c["name"] for c in manifest["characters"]], ["Napo"])

    def test_line_missing_id_is_dropped_others_kept(self):
        script = {
            "characters": [{"id": SERGE, "name": "Serge"}],
            "acts": [
                {
                    "title": "Acte I",
                    "scenes": [
                        {
                            "title": "Scène 1",
                            "lines": [
                                {"characterId": SERGE, "text": "sans id"},
                                {"id": L1, "characterId": SERGE, "text": "ok"},
                                "junk",
                            ],
                        }
                    ],
                }
            ],
        }
        manifest = build_manifest(script, {})
        self.assertEqual([l["id"] for l in manifest["lines"]], [L1])

    def test_unknown_character_resolves_to_question_mark(self):
        script = {
            "characters": [],
            "acts": [
                {
                    "title": "A",
                    "scenes": [{"title": "S", "lines": [{"id": L1, "characterId": "ghost", "text": "x"}]}],
                }
            ],
        }
        manifest = build_manifest(script, {})
        self.assertEqual(manifest["lines"][0]["character"], "?")

    def test_non_string_clip_entry_is_ignored(self):
        # {"text": ...} is the pre-{id: text} clips.json format: it must
        # degrade to "manquant", never crash.
        manifest = build_manifest(SCRIPT, {L1: {"character": "Serge", "text": "junk"}, L2: None})
        statuses = {l["id"]: l["status"] for l in manifest["lines"]}
        self.assertEqual(statuses[L1], "manquant")
        self.assertEqual(statuses[L2], "manquant")

    def test_sanitize_preserves_valid_script(self):
        self.assertEqual(sanitize_script(SCRIPT)["acts"], SCRIPT["acts"])


class TestHistoryPassthrough(unittest.TestCase):
    """Le journal traverse le manifest sans être retouché : c'est update_history
    qui le tient, build_manifest ne fait que le porter jusqu'aux pages."""

    def test_runs_are_copied_verbatim(self):
        manifest = build_manifest(SCRIPT, CLIPS, EXAMPLE_RUNS)
        self.assertEqual(manifest["history"], EXAMPLE_RUNS)

    def test_history_is_always_present_even_without_a_journal(self):
        # Sans la clé, `manifest.history` serait undefined côté front ; le
        # dashboard tolère les deux, mais le contrat reste « toujours un tableau ».
        self.assertEqual(build_manifest(SCRIPT, CLIPS)["history"], [])

    def test_a_malformed_journal_degrades_to_empty(self):
        # history.json est écrit par l'Action, mais il vit dans data/ à côté d'un
        # script.json éditable à la main : un journal abîmé ne casse pas le build.
        for bad in (None, {}, "nope", 42, {"runs": []}):
            self.assertEqual(build_manifest(SCRIPT, CLIPS, bad)["history"], [])

    def test_no_run_timestamp_is_added_to_the_manifest(self):
        # Un champ réécrit à chaque exécution ferait différer manifest.json à
        # tous les pushes, donc un commit robot chaque fois.
        self.assertNotIn("generatedAt", build_manifest(SCRIPT, CLIPS))


if __name__ == "__main__":
    unittest.main()
