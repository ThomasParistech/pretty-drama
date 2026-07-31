"""Process everything the coordinator drops in uploads/: voice ZIPs and scripts.

**One upload zone per play**, `uploads/<play id>/`, and it is the FOLDER that
routes the file, never its content. That is what makes a damaged, therefore
unreadable, ZIP land in its play's journal all the same: a file that cannot be
opened cannot say which play it belongs to. The coordinator never types this path,
they click the upload button of the play they are working on.

The id the file carries (a script's `id` field, a ZIP manifest's `play` field)
therefore serves to VERIFY and not to route: a file that names a play other than
the one whose upload zone it sits in is refused with a readable reason, rather
than writing one play's voices or script over another's.

The kind is deduced from the extension: `.zip` = an actor's voices, `.json` = the
play's script. Hidden files are left in place (`.gitkeep`, which keeps the upload
zone alive in git), any other file is reported to the journal then removed
(leaving it there would have it reported again on every run).

**A play is born from a script upload**, in an upload zone that matches no play
yet: the folder is then created with the promoted script inside. Two paths lead
there, and the second one is a safety net:
 - `uploads/<new id>/script.json`, what the plays management page offers;
 - `uploads/script.json` at the root, routed by the file's `id` alone, for the case
   where GitHub would refuse to serve its upload page on a folder it does not know
   yet, and for the coordinator who would drop a file at the old address by habit.
A voice ZIP, on the other hand, is never accepted at the root: voices always
concern a play that exists, and that play carries its own upload button.

What no play claims (a file dropped at the root with no readable id, an upload
folder whose name is not a valid id) is recorded in the ROOT journal,
`data/history.json`, displayed by the plays management page. The journal is the
project's only feedback channel: a refused file always says so somewhere, without
letting one play's uploads into another play's journal for that.

Important corollary: `script.json` is no longer dropped by hand over the source of
truth. It arrives in an upload zone, is **validated** here, and is only promoted
afterwards (cf. `validate_script`). An unreadable file, or one that is not a
script, therefore becomes a journal line, no longer a failed workflow with the
play overwritten. The bytes are written **verbatim**: going through
`sanitize_script` would lose what it ignores (the character colours).

For each ZIP:
 - read its manifest.json ({play: play id, clips: {line id: raw text}}):
   the text is the RAW line text at recording time; normalization happens ONLY
   here in the Action (single implementation), never in the browser. The audio
   member is named {id}.{ext} (extension chosen by the recording browser),
   so it is located from the id alone. `play` does not route the upload (the
   folder the file is dropped in does that), it VERIFIES it: a ZIP that names a
   play other than the one whose upload zone it sits in is refused.
 - VALIDATE the whole manifest first, then transcode every clip with ffmpeg
   in a single pass (leading/trailing silence trim + loudness normalization +
   mp3 mono ~64 kbps) into a temp dir, and only if EVERY clip succeeded,
   publish the play's clips/{id}.mp3 and update its data/clips.json
   ({line id: raw text}).
   A ZIP is merged entirely or not at all, never half.
 - delete the processed ZIP (idempotent merge: re-sending a clip for the same
   line id simply overwrites it)

Faulty files (corrupted ZIP, missing manifest, ffmpeg failure, oversized,
unreadable script) are also removed, otherwise they would fail on every
subsequent run. ANY exception on one file is contained: it must not block the
other files nor lose the updates already merged in this run.

The fate of EVERY file (success as well as error) is written to
uploads_result.json, filed by play, which update_history.py records in each play's
journal (or in the root one): it is the coordinator's only feedback, and they read
neither the CI logs nor the issues.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from build_manifest import sanitize_script
from common import (
    REPO_ROOT,
    UPLOADS_DIR,
    is_play_id,
    load_json,
    play_clips_dir,
    play_data_dir,
    play_uploads_dir,
    write_json,
)

# Ephemeral (gitignored): handed to update_history.py within the same run.
RESULT_PATH = REPO_ROOT / "uploads_result.json"

# This result ends up displayed on the Progress page, and it embeds fragments
# chosen by the ZIP (file name, manifest excerpts, ffmpeg output): everything is
# put on a single line and capped here, once and for all.
MAX_FILENAME_CHARS = 100
MAX_ERROR_CHARS = 300

# Line ids become clip filenames, so only accept strictly safe characters.
# Mirror of SAFE_ID in src/editor/reducer.js, keep in sync. (Alphanumeric,
# not just hex: hand-edited readable ids must not be rejected at this late
# stage when the editor accepted them.)
LINE_ID_PATTERN = re.compile(r"^[0-9a-zA-Z-]{1,64}$")

# Sanity caps against hostile or absurd uploads (a real take is a few
# hundred kB; a whole play's ZIP a few dozen MB).
MAX_CLIPS_PER_ZIP = 2000
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_CLIP_BYTES = 50 * 1024 * 1024
# A whole play in JSON weighs a few hundred kilobytes.
MAX_SCRIPT_BYTES = 5 * 1024 * 1024

LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"

# The silence threshold is RELATIVE to the take's own peak, never an absolute
# dBFS value: takes arrive at wildly different levels (distance to the mic,
# browser AGC). A fixed -45 dBFS threshold leaves a second of dead air on a
# loud take and eats the first word of a quiet one (measured: the same clip
# attenuated by 20 dB lost 300 ms of speech).
TRIM_BELOW_PEAK_DB = 35.0
# Sound must hold above the threshold this long to count as "the take has
# started". Without it, trimming does nothing at all on most takes: browsers
# put a click of a few dozen ms on the very first samples, and ffmpeg's
# silenceremove stops looking as soon as it sees one non-silent sample.
TRIM_ONSET_SECONDS = 0.05
# Silence kept on each side, so words neither start nor stop abruptly.
TRIM_KEEP_SECONDS = 0.1
# Under that peak the take holds no voice at all (muted mic, wrong input):
# trimming it would remove everything and write an empty, unplayable mp3, so it
# is transcoded as-is.
SILENT_PEAK_DBFS = -60.0


class UploadError(Exception):
    """A problem with one uploaded file, described in French: the message is shown
    as-is to the coordinator, in the journal of the Progress page. It is DATA
    rendered by the bilingual UI, which is why it stays French for now; see the
    "known gap" note in CLAUDE.md."""


def short(text, limit: int) -> str:
    """Untrusted text made ready to display: a single line, capped."""
    text = " ".join(str(text).split())
    return text[:limit] + "…" if len(text) > limit else text


def read_member_capped(archive, name: str, cap: int) -> bytes:
    """Read a ZIP member enforcing a REAL decompressed-size cap (headers can
    lie, so count the actual bytes)."""
    with archive.open(name) as fh:
        data = fh.read(cap + 1)
    if len(data) > cap:
        raise UploadError(f"le fichier « {name} » est anormalement gros (plus de {cap // (1024 * 1024)} Mo)")
    return data


def parse_peak_dbfs(ffmpeg_stderr: str) -> float | None:
    """Peak level (dBFS) reported by ffmpeg's volumedetect, or None when it is
    missing or not a number (« -inf » for a digitally silent take)."""
    match = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", ffmpeg_stderr)
    return float(match.group(1)) if match else None


def measure_peak_dbfs(source: Path) -> float | None:
    """Decode the take once just to measure its peak. NOTE: no -loglevel error
    here, volumedetect reports on stderr at the default level."""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(source), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return parse_peak_dbfs(result.stderr)


def audio_filter(peak_dbfs: float | None) -> str:
    """ffmpeg filter chain for one take:
     1. trim leading silence
     2. reverse, trim (now-leading) trailing silence, reverse back
     3. loudness normalization (EBU R128)
    Trimming is dropped when the peak is unknown (measure failed: better a
    take with dead air than a chopped one) or too low to hold any voice."""
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
    """Validate the ZIP's manifest and return (declared play id,
    (line_id, audio_member_name, raw_text) triples).

    Two forms are accepted, and that is deliberate:
     - `{"play": "<id>", "clips": {line id: raw text}}`, the one the Recording
       page writes;
     - the BARE mapping `{line id: raw text}` of the ZIPs downloaded before the repo
       knew how to host several plays. An actor may have had theirs sitting in their
       downloads for weeks, and there is nothing to gain by refusing it: it yields
       an empty play id, therefore no verification, and it is the upload folder that
       decides, as it does for all the others.

    The id returned is a VERIFICATION, never a routing (cf. `downloadZip` in
    src/recorder/App.jsx): empty, it says nothing and blocks nothing.

    Known and accepted limit: a ZIP of the old form one of whose lines carried the
    id "play" or "clips" would be read as the named form, therefore refused with a
    format reason. The ids the editor mints are UUIDs, and the price of a
    hand-edited id that unlucky is an error message, never an mp3 written in the
    wrong place.
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

    # Which of the two forms? The presence of either named key is enough to settle
    # it, and it gives a frank format message when the other one is missing, where
    # falling back on the bare mapping would have it look for an audio file named
    # "clips.webm". That is also what keeps refusing the form before this one
    # (`{character, clips: [...]}`), whose clips were a LIST.
    if "play" in manifest or "clips" in manifest:
        play = manifest.get("play", "")
        clips = manifest.get("clips")
        if not isinstance(clips, dict) or (play != "" and not is_play_id(play)):
            raise UploadError("le manifest.json du ZIP n'a pas le format attendu")
    else:
        play, clips = "", manifest

    if len(clips) > MAX_CLIPS_PER_ZIP:
        raise UploadError(f"le ZIP contient trop de clips ({len(clips)})")

    # Validate EVERY entry before touching anything.
    audio_names = names - {"manifest.json"}
    entries = []
    for line_id, text in clips.items():
        # fullmatch and not match: in Python, `$` also accepts a trailing newline
        # ("abc\n" would pass), where the browser's SAFE_ID rejects it. The two
        # guards must say exactly the same thing.
        if not LINE_ID_PATTERN.fullmatch(line_id) or not isinstance(text, str):
            raise UploadError(f"une entrée du manifest est invalide : {str({line_id: text})[:200]}")
        # The audio member is {id}.{ext}, the extension depends on the
        # recording browser, so locate it by id (ids cannot contain dots,
        # and the fullmatch keeps the member name free of path tricks).
        matches = [n for n in audio_names if re.fullmatch(re.escape(line_id) + r"\.[0-9a-zA-Z]+", n)]
        if len(matches) != 1:
            raise UploadError(
                f"le fichier audio de la réplique « {line_id} » est introuvable (ou en double) dans le ZIP"
            )
        entries.append((line_id, matches[0], text))
    return play, entries


def process_zip(zip_path: Path, clips_index: dict, clips_dir: Path, expected_play: str = "") -> int:
    """All-or-nothing merge of one ZIP. Returns the number of clips merged.

    `clips_dir` is the play's clips folder (`plays/<id>/clips/`): it arrives as an
    argument and is no longer a module path, since every play has its own.

    `expected_play` is the play whose upload zone this ZIP feeds. The ZIP is refused
    when it names ANOTHER one: its mp3s are named by line id, so merging them here
    would write one play's voices under another play's lines, and nobody would
    notice before the rehearsal. Empty (a ZIP from before this field, or a play with
    no id), there is nothing to verify."""
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

        # Phase 1: extract + transcode everything into the temp dir.
        transcoded = []  # (line_id, tmp_mp3_path, raw_text)
        for line_id, file_name, text in entries:
            raw = tmp_dir / f"in-{file_name}"
            raw.write_bytes(read_member_capped(archive, file_name, MAX_CLIP_BYTES))
            out = tmp_dir / f"{line_id}.mp3"
            transcode(raw, out)
            # The source is of no further use (transcode read it twice, one
            # volumedetect pass then the conversion): it leaves the disk right
            # away. Without that, the temp folder's peak usage is the SUM of the
            # sources, that is MAX_CLIPS_PER_ZIP x MAX_CLIP_BYTES at worst, well
            # beyond what a runner has free. A full disk is not contained to the
            # offending file the way the rest is: it would take down the writing
            # of clips.json and the commit, therefore the uploads already merged
            # in this run. The mp3s produced, on the other hand, necessarily pile
            # up (that is the all-or-nothing merge) but weigh 64 kbps mono.
            raw.unlink(missing_ok=True)
            transcoded.append((line_id, out, text))

        # Phase 2: everything succeeded, publish atomically-ish.
        clips_dir.mkdir(parents=True, exist_ok=True)
        for line_id, out, text in transcoded:
            shutil.move(str(out), str(clips_dir / f"{line_id}.mp3"))
            # Raw text at recording time; compared after normalization
            # by build_manifest.py.
            clips_index[line_id] = text
        return len(transcoded)


def count_lines(script: dict) -> int:
    return sum(len(scene["lines"]) for act in script["acts"] for scene in act["scenes"])


def validate_script(raw: bytes, current: dict, expected_play: str = "") -> None:
    """Refuse a candidate that is not a play script, BEFORE it becomes the source
    of truth.

    Deliberately stricter than `sanitize_script`, which is a lenient reader: here we
    are deciding to overwrite a play's `script.json`. A valid but foreign JSON
    (`[1, 2, 3]`, an export of something else) would sanitize into an empty play and
    would erase the troupe's play, hence the guard rail: a candidate with no line at
    all never replaces a play that has some."""
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
    # Same verification as for a voice ZIP, and for the same reason: the file names
    # its play, the folder it is dropped in names one too, and letting the two
    # contradict each other would overwrite one play's script with another's. An
    # empty id (a script downloaded before this field existed) says nothing and
    # blocks nothing: it is the folder that decides.
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


def process_script(path: Path, script_path: Path, expected_play: str = "") -> None:
    """Promote an uploaded script to the play's script.json, or raise UploadError.

    `script_path` is the destination (`plays/<id>/data/script.json`). It arrives as an
    argument and is no longer a module path: it is the upload folder that designates
    the play, and this destination may not exist yet, a script upload being what
    CREATES a play."""
    current = load_json(script_path, {})
    if not isinstance(current, dict):
        current = {}
    raw = path.read_bytes()
    validate_script(raw, current, expected_play)
    # Verbatim bytes: this is the file the editor produced, and it alone carries
    # everything (character colours included: sanitize_script does copy the valid
    # form of them, but it ignores everything it does not know about).
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_bytes(raw)


def kind_of(path: Path) -> str:
    """Upload kind deduced from the extension alone. Lenient about the name: the
    browser cheerfully renames files to "script (1).json" or "voix-serge (2).zip"
    when the file already exists in the downloads."""
    suffix = path.suffix.lower()
    if suffix == ".zip":
        return "voix"
    if suffix == ".json":
        return "script"
    return "inconnu"


def deposited_files(folder: Path) -> list[Path]:
    """The files dropped in one zone. Hidden files stay in place: `.gitkeep` keeps
    the zone alive in git, it is not an upload from the coordinator.

    Scripts come BEFORE voices, and that is not cosmetic: a script is what brings a
    play into being, so in an upload that carries both, it is the script that creates
    the folder the voices attach to. In bare alphabetical order, a ZIP named
    "autre.zip" would have come first and would have been refused."""
    if not folder.is_dir():
        return []
    files = (p for p in folder.iterdir() if p.is_file() and not p.name.startswith("."))
    return sorted(files, key=lambda p: (0 if kind_of(p) == "script" else 1, p.name))


def ensure_play_layout(play_id: str) -> None:
    """The silo of a play that has just come into being: its clips folder and its
    upload zone.

    The `.gitkeep` files are not cosmetic. Git does not version an empty folder, and
    both of these folders must EXIST in the repo before they are needed: the upload
    zone because that is what the play's upload button points at, and GitHub only
    serves its upload page on a folder it knows about; the clips folder because the
    site copies it as-is at deployment."""
    for folder in (play_clips_dir(play_id), play_uploads_dir(play_id)):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / ".gitkeep").touch()


def consume(path: Path) -> None:
    """Processed or faulty, the file leaves the upload zone: merges are idempotent
    by line id, and a broken file must not keep failing forever on every run."""
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        print(f"{path.name}: cannot delete: {exc}", file=sys.stderr)


def record(entries: list[dict], path: Path, kind: str, work) -> int:
    """Run the processing of ONE file and record its fate, whatever happens.

    Returns the number of clips merged (zero for a script). Every exception is
    contained here: a faulty file must neither block the other files nor lose the
    uploads already merged in this run, and its reason ends up displayed to the
    coordinator in the journal of its play."""
    entry = {"file": short(path.name, MAX_FILENAME_CHARS), "kind": kind}
    clips = 0
    try:
        clips = work() or 0
        if kind == "voix":
            entry["clips"] = clips
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
    """Process one play's upload zone. Returns (journal lines, clips merged).

    The play may not exist yet: an upload zone that matches no play is the CREATION
    channel, and only a script is accepted there. Voices are refused, there is no
    line for them to attach to.
    """
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
                return count
            if kind == "script":
                created = not script_json.exists()
                process_script(path, script_json, play_id)
                if created:
                    ensure_play_layout(play_id)
                    print(f"{path.name}: play {play_id} created")
                else:
                    print(f"{path.name}: script promoted to plays/{play_id}/data/script.json")
                return 0
            raise UploadError(
                "type de fichier inconnu : seuls les ZIP de voix et le script de la pièce "
                "(.json) sont attendus ici"
            )

        total += record(entries, path, kind, work)

    # Written only if the play EXISTS: without this guard, an upload zone created
    # with a typo and filled with a single faulty file would manufacture a play
    # folder, therefore a ghost play in the troupe's selector.
    if script_json.exists():
        write_json(clips_json, clips_index, sort_keys=True)
    return entries, total


def claimed_play_id(path: Path) -> str:
    """The play a file dropped at the ROOT of `uploads/` claims to belong to.

    This is the only place where the CONTENT routes, for lack of a folder to do it,
    and only a script can say it (its `id` field). Returns the empty string as soon as
    the file does not say it readably: the caller then records the line in the root
    journal, which is made for that.
    """
    if kind_of(path) != "script":
        return ""
    try:
        # Capped as in `validate_script`: this file is not trustworthy, and a
        # candidate that is too big will be refused further on anyway.
        candidate = json.loads(path.read_bytes()[: MAX_SCRIPT_BYTES + 1].decode("utf-8"))
    except (OSError, ValueError):
        return ""
    if not isinstance(candidate, dict) or not is_play_id(candidate.get("id")):
        return ""
    return candidate["id"]


def process_root_zone(files: list[Path]) -> tuple[dict[str, list[dict]], list[dict], int]:
    """The root of `uploads/`: the creation channel, and the coordinator's safety net.

    Returns (lines by play, unroutable lines, clips merged). A script is routed there
    by its id alone, towards an existing play as well as towards a play to create.
    Everything else is unroutable, and says so.
    """
    by_play: dict[str, list[dict]] = {}
    unrouted: list[dict] = []
    total = 0
    for path in files:
        kind = kind_of(path)
        play_id = claimed_play_id(path)
        if play_id:
            entries, count = process_play_zone(play_id, [path])
            total += count
            # The play necessarily exists if the script was promoted; refused, it has
            # no journal to speak in and the line joins the root one.
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
    """An upload zone whose name is not a valid play id.

    It was created by hand: no file can designate it, and the site would not know how
    to write the URL of the play it claims to name. Its files are recorded then
    removed, like any faulty upload, and they are recorded in the root journal, the
    only place still able to tell the coordinator about it."""
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

    # The survey of the zones BEFORE any processing: one zone per folder, plus the
    # root. An empty folder does not count (it carries only its `.gitkeep`).
    zones: dict[str, list[Path]] = {}
    unnamed: list[tuple[str, list[Path]]] = []
    for entry in sorted(UPLOADS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        files = deposited_files(entry)
        if not files:
            continue
        if is_play_id(entry.name):
            zones[entry.name] = files
        else:
            unnamed.append((entry.name, files))
    root_files = deposited_files(UPLOADS_DIR)

    every = [p for files in zones.values() for p in files]
    every += root_files + [p for _, files in unnamed for p in files]
    if any(kind_of(p) == "voix" for p in every) and shutil.which("ffmpeg") is None:
        print("ffmpeg not found", file=sys.stderr)
        sys.exit(1)

    # The journal is kept PER PLAY (each play ignores the others' uploads), plus a
    # root journal for what no play claims.
    results: dict = {"plays": {}, "unrouted": []}
    total = 0
    for play_id, files in zones.items():
        entries, count = process_play_zone(play_id, files)
        total += count
        # A zone that failed to bring its play into being has no journal to write
        # in: its lines go to the root one.
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
