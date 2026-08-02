"""Process everything the coordinator drops in uploads/: voice ZIPs and scripts.

The FOLDER routes, the content verifies: the id a file carries only refuses one dropped
in another play's zone. Root `uploads/` is a script-only safety net routed by that id.
Whatever no play claims goes to the ROOT journal. A script is validated, then promoted
VERBATIM (sanitize_script would lose the character colours). A ZIP is merged
all-or-nothing. Every file is deleted afterwards, error or not, or it would fail again
on every run, and every exception is contained. Fates go to uploads_result.json.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from build_manifest import DEFAULT_LANGUAGE, sanitize_script
from common import (
    REPO_ROOT,
    UPLOADS_DIR,
    is_play_id,
    load_json,
    mint_play_id,
    new_play_script,
    play_clips_dir,
    play_data_dir,
    play_uploads_dir,
    write_json,
)
from script_diff import script_changes

# Ephemeral (gitignored): handed to update_history.py within the same run.
RESULT_PATH = REPO_ROOT / "uploads_result.json"

# Untrusted fragments reach the journal: flattened to one line and capped, here only.
MAX_FILENAME_CHARS = 100
MAX_ERROR_CHARS = 300

# Line ids become clip filenames. Mirror of SAFE_ID (src/editor/reducer.js).
LINE_ID_PATTERN = re.compile(r"^[0-9a-zA-Z-]{1,64}$")

# Sanity caps against hostile or absurd uploads.
MAX_CLIPS_PER_ZIP = 2000
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_CLIP_BYTES = 50 * 1024 * 1024
MAX_SCRIPT_BYTES = 5 * 1024 * 1024
MAX_TITLE_BYTES = 4 * 1024

# Closes the title, opens a note for the human. Mirror of TITLE_SEPARATOR
# (src/shared/data.js), compared by test_contracts.py.
TITLE_SEPARATOR = "---"

# The creation zone. Mirror of NEW_PLAY_DIR (src/shared/data.js), compared by
# test_contracts.py. The leading `_` puts it outside PLAY_ID_PATTERN.
NEW_PLAY_DIR = "_new-play"

LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"

# Threshold RELATIVE to the take's own peak. Measured: a fixed -45 dBFS lost 300 ms of
# speech on the same clip attenuated by 20 dB.
TRIM_BELOW_PEAK_DB = 35.0
# Onset hold. Without it trimming does nothing: browsers click on the first samples and
# silenceremove stops there.
TRIM_ONSET_SECONDS = 0.05
# Silence kept on each side, so words neither start nor stop abruptly.
TRIM_KEEP_SECONDS = 0.1
# Below this peak there is no voice (muted mic) and trimming would write an empty mp3.
SILENT_PEAK_DBFS = -60.0


class UploadError(Exception):
    """A problem with one uploaded file. The French message is shown as-is in the
    journal: it is DATA rendered by a bilingual UI, cf. the known gap in CLAUDE.md."""


def short(text, limit: int) -> str:
    """Untrusted text made ready to display: a single line, capped."""
    text = " ".join(str(text).split())
    return text[:limit] + "…" if len(text) > limit else text


def read_member_capped(archive, name: str, cap: int) -> bytes:
    """Read a ZIP member enforcing a REAL decompressed-size cap: headers lie."""
    with archive.open(name) as fh:
        data = fh.read(cap + 1)
    if len(data) > cap:
        raise UploadError(f"le fichier « {name} » est anormalement gros (plus de {cap // (1024 * 1024)} Mo)")
    return data


def parse_peak_dbfs(ffmpeg_stderr: str) -> float | None:
    """Peak dBFS from ffmpeg's volumedetect, or None (« -inf » on a silent take)."""
    match = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", ffmpeg_stderr)
    return float(match.group(1)) if match else None


def measure_peak_dbfs(source: Path) -> float | None:
    # No -loglevel error here: volumedetect reports on stderr at the default level.
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(source), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return parse_peak_dbfs(result.stderr)


def audio_filter(peak_dbfs: float | None) -> str:
    """Trim both ends, then loudnorm. No trim when the peak is unknown or too low:
    better dead air than a chopped take."""
    if peak_dbfs is None or peak_dbfs < SILENT_PEAK_DBFS:
        return LOUDNORM
    threshold = peak_dbfs - TRIM_BELOW_PEAK_DB
    trim = (
        f"silenceremove=start_periods=1:start_duration={TRIM_ONSET_SECONDS}"
        f":start_threshold={threshold:.1f}dB:start_silence={TRIM_KEEP_SECONDS}"
    )
    return f"{trim},areverse,{trim},areverse,{LOUDNORM}"


def transcode(source: Path, dest: Path) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source),
        "-af",
        audio_filter(measure_peak_dbfs(source)),
        "-ar",
        "44100",
        "-ac",
        "1",
        "-b:a",
        "64k",
        str(dest),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise UploadError(
            f"la conversion audio a échoué pour « {source.name} » : {result.stderr.strip()[:500]}"
        )


def parse_manifest(archive) -> tuple[str, list[tuple[str, str, str]]]:
    """Validate the ZIP's manifest, return (declared play id, (line_id, member, text)).

    Two forms: `{"play": id, "clips": {...}}` from the Recorder, and the legacy BARE
    mapping `{line id: text}`, which yields an empty id. The id VERIFIES, never routes.
    Accepted limit: a bare ZIP with a line id "play" or "clips" is refused on format.
    """
    names = set(archive.namelist())
    if "manifest.json" not in names:
        raise UploadError(
            "le fichier manifest.json est absent du ZIP : le ZIP doit venir de la page "
            "« Enregistrement » du site, sans être modifié"
        )
    try:
        manifest = json.loads(read_member_capped(archive, "manifest.json", MAX_MANIFEST_BYTES).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise UploadError("le manifest.json du ZIP est illisible") from exc

    if not isinstance(manifest, dict):
        raise UploadError("le manifest.json du ZIP n'a pas le format attendu")

    # Either named key settles the form; the bare fallback would hunt a "clips.webm".
    if "play" in manifest or "clips" in manifest:
        play = manifest.get("play", "")
        clips = manifest.get("clips")
        if not isinstance(clips, dict) or (play != "" and not is_play_id(play)):
            raise UploadError("le manifest.json du ZIP n'a pas le format attendu")
    else:
        play, clips = "", manifest

    if len(clips) > MAX_CLIPS_PER_ZIP:
        raise UploadError(f"le ZIP contient trop de clips ({len(clips)})")

    audio_names = names - {"manifest.json"}
    entries = []
    for line_id, text in clips.items():
        # fullmatch: Python's `$` accepts a trailing newline, SAFE_ID does not.
        if not LINE_ID_PATTERN.fullmatch(line_id) or not isinstance(text, str):
            raise UploadError(f"une entrée du manifest est invalide : {str({line_id: text})[:200]}")
        # The member is {id}.{ext} with the browser's extension: locate it by id.
        matches = [n for n in audio_names if re.fullmatch(re.escape(line_id) + r"\.[0-9a-zA-Z]+", n)]
        if len(matches) != 1:
            raise UploadError(
                f"le fichier audio de la réplique « {line_id} » est introuvable (ou en double) dans le ZIP"
            )
        entries.append((line_id, matches[0], text))
    return play, entries


def process_zip(zip_path: Path, clips_index: dict, clips_dir: Path, expected_play: str = "") -> int:
    """All-or-nothing merge of one ZIP. Returns the number of clips merged.

    `expected_play` is the play whose zone this ZIP feeds; a ZIP naming another one is
    refused, since mp3s are keyed by line id and the mistake would only surface at the
    rehearsal. Empty means nothing to verify."""
    import zipfile

    try:
        archive = zipfile.ZipFile(zip_path)
    except (zipfile.BadZipFile, OSError) as exc:
        raise UploadError("le fichier n'est pas un ZIP valide (peut-être abîmé pendant l'envoi ?)") from exc

    with archive, tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        declared_play, entries = parse_manifest(archive)
        if declared_play and expected_play and declared_play != expected_play:
            raise UploadError(
                f"ce ZIP contient les voix de la pièce « {declared_play} » : "
                f"déposez-le dans la zone de dépôt de cette pièce, pas dans celle "
                f"de « {expected_play} »"
            )

        transcoded = []  # (line_id, tmp_mp3_path, raw_text)
        for line_id, file_name, text in entries:
            raw = tmp_dir / f"in-{file_name}"
            raw.write_bytes(read_member_capped(archive, file_name, MAX_CLIP_BYTES))
            out = tmp_dir / f"{line_id}.mp3"
            transcode(raw, out)
            # Drop the source at once, or peak temp usage is their SUM (2000 x 50 MB at
            # worst); a full disk is the one failure not contained per file.
            raw.unlink(missing_ok=True)
            transcoded.append((line_id, out, text))

        clips_dir.mkdir(parents=True, exist_ok=True)
        for line_id, out, text in transcoded:
            shutil.move(str(out), str(clips_dir / f"{line_id}.mp3"))
            # Raw text at recording time; normalized only by build_manifest.py.
            clips_index[line_id] = text
        return len(transcoded)


def count_lines(script: dict) -> int:
    return sum(len(scene["lines"]) for act in script["acts"] for scene in act["scenes"])


def validate_script(raw: bytes, current: dict, expected_play: str = "") -> dict:
    """Refuse a candidate that is not a play script, BEFORE it overwrites the source of
    truth, and return it parsed so promote_script can diff it. Stricter than the lenient
    `sanitize_script`: a candidate with no line never replaces a play that has some."""
    if len(raw) > MAX_SCRIPT_BYTES:
        raise UploadError(f"le fichier est anormalement gros (plus de {MAX_SCRIPT_BYTES // (1024 * 1024)} Mo)")
    try:
        candidate = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise UploadError(
            "ce fichier n'est pas un script lisible : re-téléchargez-le depuis la page Édition"
        ) from exc
    if not isinstance(candidate, dict) or not isinstance(candidate.get("acts"), list):
        raise UploadError(
            "ce fichier n'a pas la forme d'un script de pièce (il ne vient pas de la page Édition ?)"
        )
    # As for a voice ZIP: contradicting ids would overwrite another play's script.
    declared = candidate.get("id") if is_play_id(candidate.get("id")) else ""
    if declared and expected_play and declared != expected_play:
        raise UploadError(
            f"ce script est celui de la pièce « {declared} » : déposez-le dans la "
            f"zone de dépôt de cette pièce, pas dans celle de « {expected_play} »"
        )
    if count_lines(sanitize_script(candidate)) == 0 and count_lines(sanitize_script(current)) > 0:
        raise UploadError(
            "ce script ne contient aucune réplique alors que la pièce en compte : "
            "refusé pour ne pas effacer la pièce"
        )
    return candidate


def read_title(path: Path) -> str:
    """The play title a file of the creation zone carries, or raise UploadError.

    Cut at the separator; what precedes must be exactly ONE line. Strict, where the rest
    of this module is tolerant, because that box is editable on GitHub.
    """
    raw = path.read_bytes()[: MAX_TITLE_BYTES + 1]
    if len(raw) > MAX_TITLE_BYTES:
        raise UploadError(
            "ce fichier est bien trop gros pour créer une pièce : sa première ligne "
            "doit porter le titre, et rien d'autre"
        )
    try:
        # utf-8-sig: a Windows BOM would lead the title, hence a leading hyphen in the
        # id, which PLAY_ID_PATTERN refuses.
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise UploadError("ce fichier n'est pas un texte lisible") from exc
    # splitlines also settles CRLF and lone CR, so no `\r` survives.
    kept: list[str] = []
    for line in text.splitlines():
        if line.strip() == TITLE_SEPARATOR:
            break
        kept.append(line)
    title = "\n".join(kept).strip()
    if not title:
        raise UploadError(
            "ce fichier ne porte aucun titre : la première ligne doit être le titre de "
            "la pièce"
        )
    if "\n" in title:
        raise UploadError(
            f"ce fichier porte plusieurs lignes avant le séparateur « {TITLE_SEPARATOR} » : "
            "seule la première, le titre de la pièce, doit s'y trouver"
        )
    return title


def promote_script(raw: bytes, script_path: Path, expected_play: str = "") -> dict:
    """Validate a candidate script and write it as the play's source of truth.

    The SINGLE door to plays/<id>/data/script.json, so it is also what creates a play.
    Bytes are written VERBATIM. Returns what changed, for the journal: this is the only
    place holding both versions and knowing whether a script existed at all, which is
    not the same as "was the old document empty"."""
    current = load_json(script_path, {})
    if not isinstance(current, dict):
        current = {}
    existed = script_path.exists()
    candidate = validate_script(raw, current, expected_play)
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_bytes(raw)
    return script_changes(current, candidate, created=not existed)


def process_script(path: Path, script_path: Path, expected_play: str = "") -> dict:
    """Promote an uploaded `.json` script. Returns this file's journal fields
    (`record`'s contract), or raises UploadError."""
    return {"changes": promote_script(path.read_bytes(), script_path, expected_play)}


def create_play(path: Path) -> tuple[str, dict]:
    """Bring a play into being from one file of the creation zone.

    Returns (id, what the promotion changed). The id is minted HERE and nowhere else and
    is fixed forever: renaming the play later changes its title, not its address. The
    language is the project's default, never the reader's locale; the Editor sets it.
    """
    title = read_title(path)
    play_id = mint_play_id(title)
    if not play_id:
        # Say so rather than fabricate a "play-1" that lives for years in the URL.
        raise UploadError(
            f"« {short(title, 60)} » ne laisse aucune adresse utilisable : donnez un "
            "titre contenant des lettres ou des chiffres"
        )
    script_path = play_data_dir(play_id) / "script.json"
    if script_path.exists():
        # Two titles fold onto one id ("L'École" / "L'Ecole") and the front's check is
        # bypassable. Without this gate an empty existing play was silently overwritten.
        raise UploadError(
            f"la pièce « {play_id} » existe déjà à cette adresse : changez un mot du "
            "titre, ou modifiez la pièce existante depuis la page Édition"
        )
    script = new_play_script(play_id, title, DEFAULT_LANGUAGE)
    changes = promote_script(
        json.dumps(script, ensure_ascii=False, indent=2).encode("utf-8") + b"\n",
        script_path,
        play_id,
    )
    ensure_play_layout(play_id)
    return play_id, changes


def kind_of(path: Path) -> str:
    """Upload kind from the extension alone, lenient about the name (browsers rename to
    "script (1).json"). The creation zone never calls this."""
    suffix = path.suffix.lower()
    if suffix == ".zip":
        return "voix"
    if suffix == ".json":
        return "script"
    return "inconnu"


def deposited_files(folder: Path) -> list[Path]:
    """The files dropped in one zone; hidden ones stay. Scripts sort BEFORE voices: a
    script creates the play the voices attach to."""
    if not folder.is_dir():
        return []
    files = (p for p in folder.iterdir() if p.is_file() and not p.name.startswith("."))
    return sorted(files, key=lambda p: (0 if kind_of(p) == "script" else 1, p.name))


def ensure_play_layout(play_id: str) -> None:
    """The new play's clips folder and upload zone. The `.gitkeep`s matter: git versions
    no empty folder, and GitHub only serves its upload page on a folder it knows."""
    for folder in (play_clips_dir(play_id), play_uploads_dir(play_id)):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / ".gitkeep").touch()


def consume(path: Path) -> None:
    """Processed or faulty, the file leaves the zone: merges are idempotent by line id,
    and a broken file must not fail again on every run."""
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        print(f"{path.name}: cannot delete: {exc}", file=sys.stderr)


def record(entries: list[dict], path: Path, kind: str, work) -> int:
    """Run ONE file and record its fate whatever happens; returns the clips merged.

    Every exception is contained: one faulty file must not block the others nor lose what
    this run merged. `work()` returns the journal fields of ITS kind (`clips` for a ZIP,
    `changes` for a script) and they are merged blind.
    """
    entry = {"file": short(path.name, MAX_FILENAME_CHARS), "kind": kind}
    clips = 0
    try:
        fields = work() or {}
        entry.update(fields)
        clips = fields.get("clips", 0)
    except UploadError as exc:
        entry["error"] = short(exc, MAX_ERROR_CHARS)
        print(f"{path.name}: ERROR: {exc}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001, one bad file must not sink the run
        entry["error"] = f"erreur inattendue ({type(exc).__name__})"
        print(f"{path.name}: UNEXPECTED ERROR: {exc!r}", file=sys.stderr)
    finally:
        entries.append(entry)
        consume(path)
    return clips


def process_play_zone(play_id: str, files: list[Path]) -> tuple[list[dict], int]:
    """Process one play's upload zone. Returns (journal lines, clips merged). The play
    may not exist yet: a zone matching no play accepts only a script."""
    data = play_data_dir(play_id)
    script_json = data / "script.json"
    clips_json = data / "clips.json"
    clips_index = load_json(
        clips_json, {}, f"plays/{play_id}/data/clips.json unreadable: started over from scratch"
    )
    if not isinstance(clips_index, dict):
        clips_index = {}

    entries: list[dict] = []
    total = 0
    for path in files:
        kind = kind_of(path)

        def work(path=path, kind=kind):
            if kind == "voix":
                if not script_json.exists():
                    raise UploadError(
                        f"la pièce « {play_id} » n'a pas encore de script : déposez-le "
                        "d'abord, ou vérifiez que ce ZIP est bien dans la zone de dépôt "
                        "de sa pièce"
                    )
                count = process_zip(path, clips_index, play_clips_dir(play_id), play_id)
                print(f"{path.name}: {count} clip(s) processed for {play_id}")
                return {"clips": count}
            if kind == "script":
                created = not script_json.exists()
                fields = process_script(path, script_json, play_id)
                if created:
                    ensure_play_layout(play_id)
                    print(f"{path.name}: play {play_id} created")
                else:
                    print(f"{path.name}: script promoted to plays/{play_id}/data/script.json")
                print(f"{path.name}: {fields['changes']}")
                return fields
            raise UploadError(
                "type de fichier inconnu : seuls les ZIP de voix et le script de la pièce "
                "(.json) sont attendus ici"
            )

        total += record(entries, path, kind, work)

    # Only if the play EXISTS: otherwise a zone created with a typo and one faulty file
    # would manufacture a ghost play in the chooser.
    if script_json.exists():
        write_json(clips_json, clips_index, sort_keys=True)
    return entries, total


def process_new_play_zone(files: list[Path]) -> tuple[dict[str, list[dict]], list[dict]]:
    """The creation zone, `uploads/_new-play/`. Returns (lines by play, unroutable lines).

    One file, one play; neither name nor extension is read. A creation that FAILS has no
    play to speak in, so its line goes to the ROOT journal.
    """
    by_play: dict[str, list[dict]] = {}
    unrouted: list[dict] = []
    for path in files:
        entries: list[dict] = []
        # `record` swallows the exception, so the created play comes back through this
        # dict rather than as a return value.
        outcome: dict[str, str] = {}

        def work(path=path, outcome=outcome):
            outcome["play"], changes = create_play(path)
            print(f"{path.name}: play {outcome['play']} created")
            return {"changes": changes}

        # Kind from the ZONE, not `kind_of`: the file may be named "Antigone" with no
        # extension, and the journal must not show "?" on an upload that worked.
        record(entries, path, "script", work)
        if "play" in outcome:
            by_play.setdefault(outcome["play"], []).extend(entries)
        else:
            unrouted.extend(entries)
    return by_play, unrouted


def claimed_play_id(path: Path) -> str:
    """The play a file dropped at the ROOT of `uploads/` claims. The only place where
    CONTENT routes, for lack of a folder. Empty string when it does not say so."""
    if kind_of(path) != "script":
        return ""
    try:
        # Capped as in validate_script: untrusted file, and an oversized candidate is
        # refused further on anyway.
        candidate = json.loads(path.read_bytes()[: MAX_SCRIPT_BYTES + 1].decode("utf-8"))
    except (OSError, ValueError):
        return ""
    if not isinstance(candidate, dict) or not is_play_id(candidate.get("id")):
        return ""
    return candidate["id"]


def process_root_zone(files: list[Path]) -> tuple[dict[str, list[dict]], list[dict], int]:
    """The root of `uploads/`, the coordinator's safety net. Returns (lines by play,
    unroutable lines, clips merged). Only a script routes here, by its id alone."""
    by_play: dict[str, list[dict]] = {}
    unrouted: list[dict] = []
    total = 0
    for path in files:
        kind = kind_of(path)
        play_id = claimed_play_id(path)
        if play_id:
            entries, count = process_play_zone(play_id, [path])
            total += count
            # Refused, the play has no journal to speak in: the line joins the root one.
            if (play_data_dir(play_id) / "script.json").exists():
                by_play.setdefault(play_id, []).extend(entries)
            else:
                unrouted.extend(entries)
            continue

        def work(path=path, kind=kind):
            if kind == "voix":
                raise UploadError(
                    "un ZIP de voix se dépose dans la zone de dépôt de SA pièce : ouvrez "
                    "la page Avancement de la pièce concernée et servez-vous de son "
                    "bouton de dépôt"
                )
            if kind == "script":
                raise UploadError(
                    "ce script ne dit pas à quelle pièce il appartient : re-téléchargez-le "
                    "depuis la page Édition de sa pièce, ou créez la pièce depuis la page "
                    "de gestion des pièces"
                )
            raise UploadError(
                "type de fichier inconnu : seuls les ZIP de voix et le script de la pièce "
                "(.json) sont attendus ici"
            )

        record(unrouted, path, kind, work)
    return by_play, unrouted, total


def discard_unnamed_zone(folder: str, files: list[Path]) -> list[dict]:
    """An upload zone whose name is not a valid play id: hand-made and unwritable as a
    URL. Its files go to the root journal, the only place left, then are removed."""
    entries: list[dict] = []
    for path in files:

        def work(folder=folder):
            raise UploadError(
                f"« {folder} » n'est pas un identifiant de pièce valide (minuscules, "
                "chiffres et tirets) : déposez ce fichier depuis le bouton de dépôt de "
                "la pièce concernée"
            )

        record(entries, path, kind_of(path), work)
    return entries


def main() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    zones: dict[str, list[Path]] = {}
    new_play_files: list[Path] = []
    unnamed: list[tuple[str, list[Path]]] = []
    for entry in sorted(UPLOADS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        files = deposited_files(entry)
        if not files:
            continue
        # Tested BEFORE is_play_id, or the creation zone would be discarded as a folder
        # whose name is not a play id.
        if entry.name == NEW_PLAY_DIR:
            new_play_files = files
        elif is_play_id(entry.name):
            zones[entry.name] = files
        else:
            unnamed.append((entry.name, files))
    root_files = deposited_files(UPLOADS_DIR)

    every = [p for files in zones.values() for p in files]
    every += root_files + new_play_files + [p for _, files in unnamed for p in files]
    if any(kind_of(p) == "voix" for p in every) and shutil.which("ffmpeg") is None:
        print("ffmpeg not found", file=sys.stderr)
        sys.exit(1)

    results: dict = {"plays": {}, "unrouted": []}
    total = 0

    # Creations FIRST: a play has to exist before anything can attach to it.
    new_by_play, new_unrouted = process_new_play_zone(new_play_files)
    for play_id, entries in new_by_play.items():
        results["plays"].setdefault(play_id, []).extend(entries)
    results["unrouted"].extend(new_unrouted)

    for play_id, files in zones.items():
        entries, count = process_play_zone(play_id, files)
        total += count
        # A zone that failed to create its play has no journal: root one instead.
        if (play_data_dir(play_id) / "script.json").exists():
            results["plays"].setdefault(play_id, []).extend(entries)
        else:
            results["unrouted"].extend(entries)

    root_by_play, root_unrouted, root_clips = process_root_zone(root_files)
    total += root_clips
    for play_id, entries in root_by_play.items():
        results["plays"].setdefault(play_id, []).extend(entries)
    results["unrouted"].extend(root_unrouted)

    for folder, files in unnamed:
        results["unrouted"].extend(discard_unnamed_zone(folder, files))

    # Always written, even empty: the next workflow step reads it unconditionally.
    write_json(RESULT_PATH, results)
    lines = [e for entries in results["plays"].values() for e in entries] + results["unrouted"]
    failed = sum(1 for e in lines if "error" in e)
    print(f"Done: {len(lines)} file(s), {total} clip(s), {failed} error(s)")


if __name__ == "__main__":
    main()
