"""Build plays/<id>/data/manifest.json — the single file the app pages read.

Un manifest PAR PIÈCE, dans le dossier de la pièce : les pages d'une pièce vivent
elles aussi dans ce dossier, donc elles lisent `data/manifest.json` en chemin
relatif, exactement comme du temps où le site n'en connaissait qu'une. C'est ce qui
fait qu'aucune page n'a besoin de savoir dans quelle pièce elle tourne.

Stateless join of the play's data/script.json (source of truth, produced by the
editor) and data/clips.json (state of processed clips, maintained by
process_uploads). Y est recopié le journal des derniers dépôts de CETTE pièce
(data/history.json, tenu par update_history.py) : les pages ne lisent que ce
fichier, donc c'est ici que tout ce qu'elles affichent est assemblé.

Status per line (spec §6):
 - clip exists and normalized text matches  -> "ok"
 - clip exists but normalized text differs  -> "perime"   ("À refaire")
 - no clip for this line id                 -> "manquant" ("À enregistrer")

Orphan clips (id no longer present in the script) are simply not part of the
manifest: the mp3 may linger in clips/ but is never served to the app.

script.json is hand-uploadable (and hand-editable) on github.com, so this
script must tolerate the same malformed entries the editor's sanitizeScript
tolerates — a missing key must never crash the whole workflow run.
"""

import json
import re
import sys
from pathlib import Path

from common import is_play_id, load_json, play_data_dir, play_ids, write_json
from normalize import normalize_text


def _is_id(value) -> bool:
    return isinstance(value, str) and len(value) > 0


# Couleur de personnage telle que l'éditeur l'écrit : un hex de la palette
# partagée (src/shared/characterColors.js). On valide la FORME et pas
# l'appartenance à la palette : la liste des vingt couleurs n'a qu'une
# implémentation, en JS, et la recopier ici en ferait une seconde à tenir
# synchrone. Ce garde-fou suffit à ce qu'aucune valeur inattendue ne parte dans
# un attribut `style` du navigateur ; le front comble de son côté ce qui manque.
# Un test de contrat vérifie que la palette JS passe bien cette expression.
COLOR_PATTERN = re.compile(r"#[0-9a-fA-F]{6}\Z")

# Les langues que l'éditeur sait écrire dans `language`, et le repli. Miroir de
# LOCALES / DEFAULT_LOCALE dans src/shared/i18n.js : les faire diverger ferait
# retomber au français une pièce que le front sait pourtant écrire, et un garde de
# scripts/tests/test_contracts.py compare les deux listes.
LANGUAGES = ("fr", "en")
DEFAULT_LANGUAGE = "fr"


def _color_of(character: dict):
    value = character.get("color")
    return value.lower() if isinstance(value, str) and COLOR_PATTERN.match(value) else None


def sanitize_script(raw: dict) -> dict:
    """Lenient mirror of the editor's sanitizeScript: drop malformed entries
    instead of crashing on them (the two consumers must agree on tolerance)."""
    if not isinstance(raw, dict):
        raw = {}
    # La couleur voyage jusqu'au manifest, sinon la page Répartition n'a rien
    # pour colorer ses camemberts. Elle est RECOPIÉE et jamais réparée : le
    # comblement d'une couleur absente n'a qu'une implémentation, en JS
    # (`assignColors`), et deux comblements indépendants finiraient par ne plus
    # tomber d'accord sur les mêmes couleurs, donc l'Édition et la Répartition
    # montreraient deux distributions différentes. Le champ est simplement omis
    # quand il manque ou qu'il est mal formé.
    characters = []
    for c in raw.get("characters") or []:
        # Le nom doit être NON VIDE, comme côté éditeur (`c.name.trim()` dans
        # sanitizeScript) : les deux miroirs doivent laisser tomber les mêmes
        # entrées. Un personnage sans nom ne peut pas venir de l'éditeur (ADD_ et
        # RENAME_CHARACTER refusent tous deux un nom vide), donc c'est une édition
        # à la main dans le dépôt ; le garder ici mettait une ligne anonyme dans la
        # grille de l'Avancement, un bouton sans libellé dans la légende de la
        # Répartition et un « : » nu dans le PDF, là où l'Édition, elle, montrait
        # ses répliques comme non attribuées. Écarté, ses répliques retombent sur
        # le « ? » de build_manifest, ce que l'éditeur montre déjà.
        if not (
            isinstance(c, dict)
            and _is_id(c.get("id"))
            and isinstance(c.get("name"), str)
            and c["name"].strip()
        ):
            continue
        character = {"id": c["id"], "name": c["name"]}
        color = _color_of(c)
        if color is not None:
            character["color"] = color
        characters.append(character)
    acts = []
    for act in raw.get("acts") or []:
        if not isinstance(act, dict):
            continue
        scenes = []
        for scene in act.get("scenes") or []:
            if not isinstance(scene, dict):
                continue
            lines = []
            for line in scene.get("lines") or []:
                if not isinstance(line, dict) or not _is_id(line.get("id")):
                    continue
                lines.append(
                    {
                        "id": line["id"],
                        "characterId": line["characterId"] if _is_id(line.get("characterId")) else None,
                        "text": line["text"] if isinstance(line.get("text"), str) else "",
                    }
                )
            # Ni acte ni scène ne porte de titre : leur libellé est DÉRIVÉ de
            # leur rang (miroir de src/shared/structureLabels.js). Un `title`
            # laissé par un fichier d'avant est donc ignoré, pas recopié.
            scenes.append({"lines": lines})
        acts.append({"scenes": scenes})
    return {
        # L'identifiant de la pièce, celui qui nomme son dossier (`plays/<id>/`) et
        # sa zone de dépôt. Validé ici comme il l'est côté navigateur, et c'est une
        # exception assumée à la tolérance de ce lecteur : tout le reste de cette
        # fonction accepte ce qu'elle peut lire, alors que cette valeur-là devient
        # un CHEMIN. Absent ou mal formé, il vaut la chaîne vide, et c'est
        # `process_uploads` qui refusera alors le dépôt plutôt que de deviner.
        "id": raw["id"] if is_play_id(raw.get("id")) else "",
        "title": raw.get("title") if isinstance(raw.get("title"), str) else "",
        # La langue dans laquelle la pièce est ÉCRITE, pas celle de l'interface du
        # lecteur. Elle sert au PDF (intertitres et césure) et à la voix de
        # synthèse de la Répétition. Absente ou inconnue, elle vaut le français.
        "language": raw["language"] if raw.get("language") in LANGUAGES else DEFAULT_LANGUAGE,
        "characters": characters,
        "acts": acts,
    }


def compute_status(line: dict, clips: dict) -> str:
    recorded_text = clips.get(line["id"])
    if not isinstance(recorded_text, str):
        return "manquant"
    # Both sides are RAW text (current script vs text at recording time);
    # normalization happens here and only here — single implementation, no
    # cross-language mismatch possible.
    if normalize_text(line["text"]) == normalize_text(recorded_text):
        return "ok"
    return "perime"


def build_manifest(script: dict, clips: dict, history=None) -> dict:
    script = sanitize_script(script)
    if not isinstance(clips, dict):
        clips = {}
    if not isinstance(history, list):
        history = []
    names = {c["id"]: c["name"] for c in script["characters"]}

    def enrich(line: dict, act_index: int, scene_index: int) -> dict:
        status = compute_status(line, clips)
        return {
            "id": line["id"],
            "characterId": line["characterId"],
            "character": names.get(line["characterId"], "?"),
            "text": line["text"],
            "status": status,
            "clip": f"clips/{line['id']}.mp3" if status != "manquant" else None,
            # Des RANGS et pas des libellés : c'est le front qui les met en mots,
            # dans la langue du lecteur (src/shared/structureLabels.js). Le
            # manifest reste ainsi sans un mot de français.
            "actIndex": act_index,
            "sceneIndex": scene_index,
        }

    acts = []
    flat_lines = []
    for act_index, act in enumerate(script["acts"]):
        scenes = []
        for scene_index, scene in enumerate(act["scenes"]):
            lines = [enrich(line, act_index, scene_index) for line in scene["lines"]]
            flat_lines.extend(lines)
            scenes.append({"lines": lines})
        acts.append({"scenes": scenes})

    return {
        # Recopié pour que les pages sachent DANS quelle pièce elles tournent sans
        # avoir à lire leur propre URL : la page Enregistrement l'écrit dans le ZIP
        # qu'elle produit, ce qui est ce qui permet à l'Action de refuser un ZIP
        # déposé dans la zone d'une autre pièce.
        "id": script["id"],
        "title": script["title"],
        "language": script["language"],
        # Journal des derniers dépôts, affiché par la page Avancement : sans lui
        # le respo n'a aucun retour sur ce qu'est devenu son fichier. Pas
        # d'horodatage du run ici : un champ réécrit à chaque exécution ferait
        # différer manifest.json à tous les pushes, donc un commit robot à
        # chaque fois (c'est ce qui a coûté sa place au statut du README).
        "history": history,
        "characters": script["characters"],
        "acts": acts,
        "lines": flat_lines,
    }


def build_one(play_id: str) -> bool:
    """Écrit le manifest d'UNE pièce. Rend False quand elle a été sautée.

    Une pièce sautée est une pièce dont le `script.json` ne se lit pas, et son
    manifest est alors laissé TEL QUEL : le reconstruire vide effacerait la pièce de
    tout le site (grille, répétition, PDF) sur une erreur de syntaxe, alors que le
    fichier de la veille est encore là et reste juste. Le run finit en échec, ce qui
    est le seul signal dont la CI dispose, et les autres pièces sont construites
    quand même : le silo vaut aussi pour les pannes.
    """
    data = play_data_dir(play_id)
    try:
        script = json.loads((data / "script.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        # Un dossier de pièce SANS script : c'est ce que laisse un dépôt de création
        # refusé (le fichier est parti, le journal a été écrit). On publie un
        # manifest vide plutôt que rien, pour que l'Avancement de cette pièce
        # s'ouvre et montre le journal qui dit pourquoi elle est vide.
        script = {}
    except json.JSONDecodeError as exc:
        print(
            f"plays/{play_id}/data/script.json n'est pas un JSON valide ({exc}) : "
            "restaurez sa version précédente depuis l'historique GitHub ou "
            "re-téléchargez-le depuis la page Édition. Le manifest de cette pièce "
            "est laissé tel quel.",
            file=sys.stderr,
        )
        return False
    # clips.json est écrit par la machine ; abîmé, on repart de zéro plutôt que de
    # bloquer le site (les statuts retombent à « manquant » jusqu'au prochain dépôt).
    clips = load_json(
        data / "clips.json",
        {},
        f"plays/{play_id}/data/clips.json illisible — ignoré (statuts recalculés sans lui)",
    )
    # Le journal n'est qu'un confort d'affichage : jamais un motif d'échec.
    history = load_json(
        data / "history.json", {}, f"plays/{play_id}/data/history.json illisible — journal ignoré"
    )
    runs = history.get("runs") if isinstance(history, dict) else None
    manifest = build_manifest(script, clips, runs)
    write_json(data / "manifest.json", manifest)
    total = len(manifest["lines"])
    ok = sum(1 for l in manifest["lines"] if l["status"] == "ok")
    print(f"plays/{play_id}/data/manifest.json : {total} répliques, {ok} enregistrées")
    return True


def main() -> None:
    ids = play_ids()
    if not ids:
        # Pas une erreur : un dépôt fraîchement forké n'a pas encore de pièce, et le
        # site doit se construire quand même pour offrir la page qui en crée une.
        print("aucune pièce dans plays/ : rien à construire")
        return
    # La LISTE est délibérée, et ce n'est pas un oubli à « simplifier » en
    # générateur : `all()` s'arrête au premier faux, donc une pièce au script
    # illisible empêcherait la construction de toutes celles qui la suivent dans
    # l'alphabet. On les construit toutes, puis on échoue s'il en manque une.
    if not all([build_one(play_id) for play_id in ids]):
        sys.exit(1)


if __name__ == "__main__":
    main()
