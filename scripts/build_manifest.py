"""Build plays/<id>/data/manifest.json: the single file the app pages read.

One manifest PER PLAY, in the play's folder: a play's pages live in that folder
too, so they read `data/manifest.json` as a relative path, exactly as back when the
site knew only one play. That is what makes it unnecessary for any page to know
which play it is running in.

Stateless join of the play's data/script.json (source of truth, produced by the
editor) and data/clips.json (state of processed clips, maintained by
process_uploads). Copied in here too is the journal of THIS play's latest uploads
(data/history.json, kept by update_history.py): the pages read only this file, so
this is where everything they display gets assembled.

Status per line (spec §6):
 - clip exists and normalized text matches  -> "ok"
 - clip exists but normalized text differs  -> "perime"   ("À refaire")
 - no clip for this line id                 -> "manquant" ("À enregistrer")

Orphan clips (id no longer present in the script) are simply not part of the
manifest: the mp3 may linger in clips/ but is never served to the app.

script.json is hand-uploadable (and hand-editable) on github.com, so this
script must tolerate the same malformed entries the editor's sanitizeScript
tolerates: a missing key must never crash the whole workflow run.
"""

import json
import re
import sys

from common import is_play_id, load_json, play_data_dir, play_ids, write_json
from normalize import normalize_text


def _is_id(value) -> bool:
    return isinstance(value, str) and len(value) > 0


# A character colour as the editor writes it: a hex from the shared palette
# (src/shared/characterColors.js). We validate the FORM and not the membership of
# the palette: the list of twenty colours has only one implementation, in JS, and
# copying it here would make a second one to keep in sync. This guard rail is
# enough for no unexpected value to end up in a browser `style` attribute; the
# front fills in what is missing on its side.
# A contract test checks that the JS palette does pass this expression.
COLOR_PATTERN = re.compile(r"#[0-9a-fA-F]{6}\Z")

# The languages the editor knows how to write in `language`, and the fallback.
# Mirror of LOCALES / DEFAULT_LOCALE in src/shared/i18n.js: letting them diverge
# would fall back to French for a play the front can nonetheless write, and a guard
# in scripts/tests/test_contracts.py compares the two lists.
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
    # The colour travels all the way to the manifest, otherwise the Speaking share
    # page has nothing to colour its pie charts with. It is COPIED and never repaired:
    # filling in a missing colour has only one implementation, in JS
    # (`assignColors`), and two independent fillings would end up no longer agreeing
    # on the same colours, so Editing and Speaking share would show two
    # different casts. The field is simply omitted when it is missing or malformed.
    characters = []
    for c in raw.get("characters") or []:
        # The name must be NON EMPTY, as on the editor side (`c.name.trim()` in
        # sanitizeScript): the two mirrors must drop the same entries. A character
        # with no name cannot come from the editor (ADD_ and RENAME_CHARACTER both
        # refuse an empty name), so it is a hand edit in the repo; keeping it here
        # put an anonymous row in the Progress grid, a button with no label in the
        # Speaking share legend and a bare ":" in the PDF, where Editing, for its
        # part, showed its lines as unattributed. Dropped, its lines fall back on
        # build_manifest's "?", which is what the editor already shows.
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
            # Neither an act nor a scene carries a title: their label is DERIVED
            # from their rank (mirror of src/shared/structureLabels.js). A `title`
            # left behind by an older file is therefore ignored, not copied.
            scenes.append({"lines": lines})
        acts.append({"scenes": scenes})
    return {
        # The play's id, the one that names its folder (`plays/<id>/`) and its
        # upload zone. Validated here as it is on the browser side, and that is an
        # accepted exception to this reader's tolerance: everything else in this
        # function accepts what it can read, whereas that value becomes a PATH.
        # Absent or malformed, it is the empty string, and it is then
        # `process_uploads` that will refuse the upload rather than guess.
        "id": raw["id"] if is_play_id(raw.get("id")) else "",
        "title": raw.get("title") if isinstance(raw.get("title"), str) else "",
        # The language the play is WRITTEN in, not that of the reader's interface.
        # It serves the PDF (headings and hyphenation) and Rehearsal's speech
        # synthesis. Absent or unknown, it is French.
        "language": raw["language"] if raw.get("language") in LANGUAGES else DEFAULT_LANGUAGE,
        "characters": characters,
        "acts": acts,
    }


def compute_status(line: dict, clips: dict) -> str:
    recorded_text = clips.get(line["id"])
    if not isinstance(recorded_text, str):
        return "manquant"
    # Both sides are RAW text (current script vs text at recording time);
    # normalization happens here and only here, single implementation, no
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
            # RANKS and not labels: it is the front that puts them into words, in
            # the reader's language (src/shared/structureLabels.js). The manifest
            # thus stays without a single word of French.
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
        # Copied so that the pages know WHICH play they are running in without
        # having to read their own URL: the Recording page writes it into the
        # ZIP it produces, which is what lets the Action refuse a ZIP dropped in
        # another play's zone.
        "id": script["id"],
        "title": script["title"],
        "language": script["language"],
        # Journal of the latest uploads, displayed by the Progress page: without
        # it the coordinator has no feedback at all on what became of their file. No run
        # timestamp here: a field rewritten on every execution would make
        # manifest.json differ on every push, therefore a robot commit every time
        # (that is what cost the README status its place).
        "history": history,
        "characters": script["characters"],
        "acts": acts,
        "lines": flat_lines,
    }


def build_one(play_id: str) -> bool:
    """Write ONE play's manifest. Returns False when it was skipped.

    A skipped play is a play whose `script.json` will not read, and its manifest is
    then left AS IS: rebuilding it empty would erase the play from the whole site
    (grid, rehearsal, PDF) over a syntax error, whereas yesterday's file is still
    there and remains correct. The run ends in failure, which is the only signal the
    CI has, and the other plays are built all the same: the silo holds for breakdowns
    too.
    """
    data = play_data_dir(play_id)
    try:
        script = json.loads((data / "script.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        # A play folder WITHOUT a script: that is what a refused creation upload
        # leaves behind (the file is gone, the journal was written). We publish an
        # empty manifest rather than nothing, so that this play's Progress page opens
        # and shows the journal that says why it is empty.
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
    # clips.json is written by the machine; damaged, we start over from scratch
    # rather than block the site (statuses fall back to "manquant" until the next
    # upload).
    clips = load_json(
        data / "clips.json",
        {},
        f"plays/{play_id}/data/clips.json unreadable: ignored (statuses recomputed without it)",
    )
    # The journal is only a display convenience: never a reason to fail.
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
        # Not an error: a freshly forked repo has no play yet, and the site must
        # build all the same in order to offer the page that creates one.
        print("no play in plays/: nothing to build")
        return
    # The LIST is deliberate, and it is not an oversight to be "simplified" into a
    # generator: `all()` stops at the first false value, so one play with an
    # unreadable script would prevent the building of every play that follows it in
    # the alphabet. We build them all, then fail if one is missing.
    if not all([build_one(play_id) for play_id in ids]):
        sys.exit(1)


if __name__ == "__main__":
    main()
