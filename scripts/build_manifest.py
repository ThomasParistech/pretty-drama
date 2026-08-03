"""Build plays/<id>/data/manifest.json, the single file the app pages read.

Stateless join of script.json, clips.json and history.json, one manifest per play.
Status per line: "ok", "perime" (clip exists, normalized text differs), "manquant".
script.json is hand-editable on github.com, so this reader tolerates the same malformed
entries the editor's sanitizeScript does.
"""

import json
import re
import sys

from common import is_play_id, load_json, play_data_dir, play_ids, write_json
from normalize import normalize_text


def _is_id(value) -> bool:
    return isinstance(value, str) and len(value) > 0


# Validate the FORM only: the palette has one implementation, in JS.
COLOR_PATTERN = re.compile(r"#[0-9a-fA-F]{6}\Z")

# Mirror of LOCALES / DEFAULT_LOCALE (src/shared/i18n.ts), compared by test_contracts.
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
    # Colour is COPIED, never repaired: `assignColors` (JS) is the one filling.
    characters = []
    for c in raw.get("characters") or []:
        # Non-empty name, as on the editor side: the mirrors must drop the same entries.
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
            # Labels derive from rank, so a stale `title` is dropped.
            scenes.append({"lines": lines})
        acts.append({"scenes": scenes})
    return {
        # Validated, unlike the rest here, because it becomes a PATH.
        "id": raw["id"] if is_play_id(raw.get("id")) else "",
        "title": raw.get("title") if isinstance(raw.get("title"), str) else "",
        # The language the play is WRITTEN in, not the reader's interface locale.
        "language": raw["language"] if raw.get("language") in LANGUAGES else DEFAULT_LANGUAGE,
        "characters": characters,
        "acts": acts,
    }


def compute_status(line: dict, clips: dict) -> str:
    recorded_text = clips.get(line["id"])
    if not isinstance(recorded_text, str):
        return "manquant"
    # Both sides are RAW text; normalization happens here only, single implementation.
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
            # Ranks and not labels: the front words them, so the manifest has no French.
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
        # The Recorder copies this into its ZIP, which is how a misplaced ZIP is caught.
        "id": script["id"],
        "title": script["title"],
        "language": script["language"],
        # No run timestamp: it would make manifest.json differ on every push.
        "history": history,
        "characters": script["characters"],
        "acts": acts,
        "lines": flat_lines,
    }


def build_one(play_id: str) -> bool:
    """Write ONE play's manifest. Returns False when skipped: a play whose script.json
    will not read keeps its manifest AS IS, since rebuilding it empty would erase the
    play from the whole site over a syntax error. The run still fails."""
    data = play_data_dir(play_id)
    try:
        script = json.loads((data / "script.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        # A refused creation leaves a play folder with no script: an empty manifest lets
        # its Dashboard open and show the journal saying why.
        script = {}
    except json.JSONDecodeError as exc:
        print(
            f"plays/{play_id}/data/script.json is not valid JSON ({exc}): "
            "restore its previous version from the GitHub history or "
            "download it again from the Editing page. This play's manifest "
            "is left as is.",
            file=sys.stderr,
        )
        return False
    # Damaged clips.json: start from scratch rather than block the site.
    clips = load_json(
        data / "clips.json",
        {},
        f"plays/{play_id}/data/clips.json unreadable: ignored (statuses recomputed without it)",
    )
    history = load_json(
        data / "history.json", {}, f"plays/{play_id}/data/history.json unreadable: journal ignored"
    )
    runs = history.get("runs") if isinstance(history, dict) else None
    manifest = build_manifest(script, clips, runs)
    write_json(data / "manifest.json", manifest)
    total = len(manifest["lines"])
    ok = sum(1 for l in manifest["lines"] if l["status"] == "ok")
    print(f"plays/{play_id}/data/manifest.json: {total} lines, {ok} recorded")
    return True


def main() -> None:
    ids = play_ids()
    if not ids:
        print("no play in plays/: nothing to build")
        return
    # The LIST is deliberate: `all()` short-circuits, so a generator would stop building
    # at the first unreadable script. Build them all, then fail.
    if not all([build_one(play_id) for play_id in ids]):
        sys.exit(1)


if __name__ == "__main__":
    main()
