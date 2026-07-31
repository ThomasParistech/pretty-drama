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
        # Des RANGS et pas des libellés : les actes et les scènes n'ont plus de
        # titre, et c'est le front qui les met en mots, dans la langue du lecteur.
        # Le manifest ne doit donc plus porter un seul mot de français ici.
        line = self.manifest["acts"][0]["scenes"][0]["lines"][0]
        self.assertEqual(line["actIndex"], 0)
        self.assertEqual(line["sceneIndex"], 0)
        self.assertIn("status", line)

    def test_acts_and_scenes_carry_no_title(self):
        # Le garde du choix : un titre recopié ici redeviendrait une donnée dans
        # une langue, et il repartirait vers le PDF et les colonnes de l'Avancement.
        for act in self.manifest["acts"]:
            self.assertNotIn("title", act)
            for scene in act["scenes"]:
                self.assertNotIn("title", scene)

    def test_the_play_id_reaches_the_manifest(self):
        # C'est ce qui permet à la page Enregistrement d'inscrire sa pièce dans le
        # ZIP qu'elle produit, donc à l'Action de refuser un ZIP déposé dans la zone
        # d'une autre pièce.
        self.assertEqual(build_manifest({"id": "le-malade", "acts": []}, {})["id"], "le-malade")

    def test_a_malformed_play_id_becomes_empty_rather_than_a_path(self):
        # Exception assumée à la tolérance de ce lecteur : cette valeur devient un
        # CHEMIN (`plays/<id>/`), donc elle est validée ici comme elle l'est côté
        # navigateur. Vide, elle ne dit rien et ne route rien.
        for bad in ("../evil", "Le-Malade", "le malade", "-malade", "x" * 65, 42, None):
            self.assertEqual(build_manifest({"id": bad, "acts": []}, {})["id"], "")
        self.assertEqual(build_manifest({"acts": []}, {})["id"], "")

    def test_the_play_language_reaches_the_manifest(self):
        # Le PDF et la voix de synthèse de la Répétition en dépendent.
        self.assertEqual(self.manifest["language"], "fr")
        self.assertEqual(build_manifest({"language": "en", "acts": []}, {})["language"], "en")
        # Une langue absente ou inconnue vaut le français, comme côté JS.
        self.assertEqual(build_manifest({"acts": []}, {})["language"], "fr")
        self.assertEqual(build_manifest({"language": "kl", "acts": []}, {})["language"], "fr")


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

    def test_a_character_without_a_real_name_is_dropped_like_in_the_editor(self):
        """Miroir de `c.name.trim()` (sanitizeScript, éditeur) : les deux lecteurs
        doivent laisser tomber les mêmes entrées.

        Gardé ici, un personnage anonyme mettait une ligne sans nom dans la grille
        de l'Avancement et un bouton sans libellé dans la légende de la
        Répartition, alors que l'Édition montrait ses répliques non attribuées.
        Écarté, ses répliques retombent sur le « ? » commun."""
        script = {
            "characters": [{"id": SERGE, "name": "  "}, {"id": NAPO, "name": ""}],
            "acts": [{"scenes": [{"lines": [{"id": "l1", "characterId": SERGE, "text": "Bon."}]}]}],
        }
        manifest = build_manifest(script, {})
        self.assertEqual(manifest["characters"], [])
        self.assertEqual(manifest["lines"][0]["character"], "?")

    def test_character_color_reaches_the_manifest(self):
        """Sans elle, la page Répartition n'a rien pour colorer ses camemberts.

        Recopiée verbatim (en minuscules), jamais réparée : le comblement d'une
        couleur absente n'a qu'une implémentation, en JS.
        """
        script = {
            "characters": [{"id": SERGE, "name": "Serge", "color": "#1F77B4"}],
            "acts": [],
        }
        manifest = build_manifest(script, {})
        self.assertEqual(manifest["characters"][0]["color"], "#1f77b4")

    def test_malformed_color_is_omitted_and_the_character_stays(self):
        """Un script hand-édité ne doit ni planter le workflow ni faire partir une
        valeur inattendue dans un attribut `style` du navigateur. Le champ est
        omis, donc le front la comble comme il comble une couleur absente."""
        for bad in ("bleu", "#12345", "#1234567", 255, None, "", "oklch(0.58 0.14 255)", []):
            script = {"characters": [{"id": SERGE, "name": "Serge", "color": bad}], "acts": []}
            character = build_manifest(script, {})["characters"][0]
            self.assertEqual(character["name"], "Serge", f"couleur : {bad!r}")
            self.assertNotIn("color", character, f"couleur : {bad!r}")

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
        # Comparé aux répliques et non aux actes entiers : `sanitize_script`
        # retire maintenant les titres d'acte et de scène (le libellé est dérivé
        # du rang), donc les actes ne sont plus rendus tels quels.
        sane = sanitize_script(SCRIPT)
        self.assertEqual(
            [[[l for l in sc["lines"]] for sc in a["scenes"]] for a in sane["acts"]],
            [[[l for l in sc["lines"]] for sc in a["scenes"]] for a in SCRIPT["acts"]],
        )

    def test_sanitize_drops_a_leftover_act_or_scene_title(self):
        # Un script.json d'avant en porte : il est ignoré et non recopié, sinon le
        # format garderait deux façons de nommer une scène.
        sane = sanitize_script(
            {"acts": [{"title": "Prologue", "scenes": [{"title": "Ouverture", "lines": []}]}]}
        )
        self.assertNotIn("title", sane["acts"][0])
        self.assertNotIn("title", sane["acts"][0]["scenes"][0])


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
