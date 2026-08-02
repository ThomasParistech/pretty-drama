"""Status ok / perime / manquant, orphan clips, journal passthrough.
manifest.json is the only file the pages read."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build_manifest import build_manifest, sanitize_script

EXAMPLE_RUNS = json.loads(
    (Path(__file__).resolve().parent / "history-example.json").read_text(encoding="utf-8")
)["runs"]

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

# clips.json holds the RAW text captured at recording time.
CLIPS = {
    "aaaa-1111": "SILENCE ; c'est moi le chef…",  # cosmetic only -> ok
    "bbbb-2222": "Je suis souffrant.",  # different words -> perime
    "zzzz-9999": "Vieille réplique supprimée.",  # orphan -> absent
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
        # Ranks, not labels: the front words them in the reader's language.
        line = self.manifest["acts"][0]["scenes"][0]["lines"][0]
        self.assertEqual(line["actIndex"], 0)
        self.assertEqual(line["sceneIndex"], 0)
        self.assertIn("status", line)

    def test_acts_and_scenes_carry_no_title(self):
        # A title here would be data in one language, travelling to the PDF too.
        for act in self.manifest["acts"]:
            self.assertNotIn("title", act)
            for scene in act["scenes"]:
                self.assertNotIn("title", scene)

    def test_the_play_id_reaches_the_manifest(self):
        # The Recorder writes it into its ZIP, so the Action can refuse a misfiled one.
        self.assertEqual(build_manifest({"id": "le-malade", "acts": []}, {})["id"], "le-malade")

    def test_a_malformed_play_id_becomes_empty_rather_than_a_path(self):
        # Exception to this reader's tolerance: the value becomes a path `plays/<id>/`.
        for bad in ("../evil", "Le-Malade", "le malade", "-malade", "x" * 65, 42, None):
            self.assertEqual(build_manifest({"id": bad, "acts": []}, {})["id"], "")
        self.assertEqual(build_manifest({"acts": []}, {})["id"], "")

    def test_the_play_language_reaches_the_manifest(self):
        # The PDF and Rehearsal's speech synthesis depend on it.
        self.assertEqual(self.manifest["language"], "fr")
        self.assertEqual(build_manifest({"language": "en", "acts": []}, {})["language"], "en")
        self.assertEqual(build_manifest({"acts": []}, {})["language"], "fr")
        self.assertEqual(build_manifest({"language": "kl", "acts": []}, {})["language"], "fr")


class TestMalformedScriptTolerance(unittest.TestCase):
    """script.json is hand-editable: drop malformed entries like sanitizeScript, never crash."""

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

    def test_a_character_without_a_real_name_is_dropped_like_in_the_editor(self):
        # Mirror of `c.name.trim()` (sanitizeScript); orphan lines fall back on "?".
        script = {
            "characters": [{"id": SERGE, "name": "  "}, {"id": NAPO, "name": ""}],
            "acts": [{"scenes": [{"lines": [{"id": "l1", "characterId": SERGE, "text": "Bon."}]}]}],
        }
        manifest = build_manifest(script, {})
        self.assertEqual(manifest["characters"], [])
        self.assertEqual(manifest["lines"][0]["character"], "?")

    def test_character_color_reaches_the_manifest(self):
        # Copied verbatim, never repaired: filling a missing colour is JS-only.
        script = {
            "characters": [{"id": SERGE, "name": "Serge", "color": "#1F77B4"}],
            "acts": [],
        }
        manifest = build_manifest(script, {})
        self.assertEqual(manifest["characters"][0]["color"], "#1f77b4")

    def test_malformed_color_is_omitted_and_the_character_stays(self):
        # Omitted, not repaired: no unexpected value reaches a `style` attribute.
        for bad in ("bleu", "#12345", "#1234567", 255, None, "", "oklch(0.58 0.14 255)", []):
            script = {"characters": [{"id": SERGE, "name": "Serge", "color": bad}], "acts": []}
            character = build_manifest(script, {})["characters"][0]
            self.assertEqual(character["name"], "Serge", f"colour: {bad!r}")
            self.assertNotIn("color", character, f"colour: {bad!r}")

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
        # {"text": ...} is the pre-{id: text} clips.json format.
        manifest = build_manifest(SCRIPT, {L1: {"character": "Serge", "text": "junk"}, L2: None})
        statuses = {l["id"]: l["status"] for l in manifest["lines"]}
        self.assertEqual(statuses[L1], "manquant")
        self.assertEqual(statuses[L2], "manquant")

    def test_sanitize_preserves_valid_script(self):
        # Compared on lines, not acts: `sanitize_script` strips act and scene titles.
        sane = sanitize_script(SCRIPT)
        self.assertEqual(
            [[[l for l in sc["lines"]] for sc in a["scenes"]] for a in sane["acts"]],
            [[[l for l in sc["lines"]] for sc in a["scenes"]] for a in SCRIPT["acts"]],
        )

    def test_sanitize_drops_a_leftover_act_or_scene_title(self):
        # Older files carry some; two ways of naming a scene is one too many.
        sane = sanitize_script(
            {"acts": [{"title": "Prologue", "scenes": [{"title": "Ouverture", "lines": []}]}]}
        )
        self.assertNotIn("title", sane["acts"][0])
        self.assertNotIn("title", sane["acts"][0]["scenes"][0])


class TestHistoryPassthrough(unittest.TestCase):
    """update_history maintains the journal; build_manifest only carries it."""

    def test_runs_are_copied_verbatim(self):
        manifest = build_manifest(SCRIPT, CLIPS, EXAMPLE_RUNS)
        self.assertEqual(manifest["history"], EXAMPLE_RUNS)

    def test_history_is_always_present_even_without_a_journal(self):
        # The contract with the front is "always an array".
        self.assertEqual(build_manifest(SCRIPT, CLIPS)["history"], [])

    def test_a_malformed_journal_degrades_to_empty(self):
        # history.json is committed, hence hand-editable.
        for bad in (None, {}, "nope", 42, {"runs": []}):
            self.assertEqual(build_manifest(SCRIPT, CLIPS, bad)["history"], [])

    def test_no_run_timestamp_is_added_to_the_manifest(self):
        # A field rewritten every run means a robot commit on every push.
        self.assertNotIn("generatedAt", build_manifest(SCRIPT, CLIPS))


if __name__ == "__main__":
    unittest.main()
