"""Process everything the respo drops in uploads/ : voice ZIPs and scripts.

**Un seul dossier de dépôt**, `uploads/`, pour les deux sortes de fichiers que
le respo reçoit ou produit. Le type est déduit de l'extension : `.zip` = voix
d'un acteur, `.json` = script de la pièce. Les fichiers cachés sont laissés en
place (`.gitkeep`), tout autre fichier est signalé au journal puis retiré (le
laisser le ferait re-signaler à chaque run).

Corollaire important : `data/script.json` n'est plus déposé à la main par-dessus
la source de vérité. Il arrive dans `uploads/`, est **validé** ici, et n'est
promu qu'ensuite (cf. `validate_script`). Un fichier illisible ou qui n'est pas
un script devient donc une ligne de journal, plus un workflow en échec avec la
pièce écrasée. Les octets sont écrits **verbatim** : passer par
`sanitize_script` perdrait ce qu'il ignore (les couleurs des personnages).

For each ZIP:
 - read its manifest.json (bare {line id: raw text} mapping) — the text is
   the RAW line text at recording time; normalization happens ONLY here
   in the Action (single implementation), never in the browser. The audio
   member is named {id}.{ext} (extension chosen by the recording browser),
   so it is located from the id alone.
 - VALIDATE the whole manifest first, then transcode every clip with ffmpeg
   in a single pass (leading/trailing silence trim + loudness normalization +
   mp3 mono ~64 kbps) into a temp dir, and only if EVERY clip succeeded,
   publish clips/{id}.mp3 and update data/clips.json ({line id: raw text}).
   A ZIP is merged entirely or not at all — never half.
 - delete the processed ZIP (idempotent merge: re-sending a clip for the same
   line id simply overwrites it)

Faulty files (corrupted ZIP, missing manifest, ffmpeg failure, oversized,
unreadable script) are also removed — otherwise they would fail on every
subsequent run. ANY exception on one file is contained: it must not block the
other files nor lose the updates already merged in this run.

Le sort de CHAQUE fichier (succès comme erreur) est écrit dans
uploads_result.json, que update_history.py consigne dans le journal affiché par
la page Avancement : c'est le seul retour du respo, qui ne lit ni les logs de la
CI ni les issues.
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
from common import REPO_ROOT, write_json

UPLOADS_DIR = REPO_ROOT / "uploads"
CLIPS_DIR = REPO_ROOT / "clips"
CLIPS_JSON = REPO_ROOT / "data" / "clips.json"
SCRIPT_JSON = REPO_ROOT / "data" / "script.json"
# Éphémère (gitignoré) : passé à update_history.py dans le même run.
RESULT_PATH = REPO_ROOT / "uploads_result.json"

# Ce résultat finit affiché sur la page Avancement, et il embarque des
# fragments choisis par le ZIP (nom du fichier, extraits de manifest, sortie
# ffmpeg) : tout est mis sur une ligne et plafonné ici, une fois pour toutes.
MAX_FILENAME_CHARS = 100
MAX_ERROR_CHARS = 300

# Line ids become clip filenames, so only accept strictly safe characters.
# Mirror of SAFE_ID in src/editor/reducer.js — keep in sync. (Alphanumeric,
# not just hex: hand-edited readable ids must not be rejected at this late
# stage when the editor accepted them.)
LINE_ID_PATTERN = re.compile(r"^[0-9a-zA-Z-]{1,64}$")

# Sanity caps against hostile or absurd uploads (a real take is a few
# hundred kB; a whole play's ZIP a few dozen MB).
MAX_CLIPS_PER_ZIP = 2000
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_CLIP_BYTES = 50 * 1024 * 1024
# Une pièce entière en JSON pèse quelques centaines de kilo-octets.
MAX_SCRIPT_BYTES = 5 * 1024 * 1024

LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"

# The silence threshold is RELATIVE to the take's own peak, never an absolute
# dBFS value: takes arrive at wildly different levels (distance au micro, AGC
# du navigateur). A fixed -45 dBFS threshold leaves a second of dead air on a
# loud take and eats the first word of a quiet one (mesuré : le même clip
# atténué de 20 dB perdait 300 ms de parole).
TRIM_BELOW_PEAK_DB = 35.0
# Sound must hold above the threshold this long to count as "the take has
# started". Without it, trimming does nothing at all on most takes: browsers
# put a click of a few dozen ms on the very first samples, and ffmpeg's
# silenceremove stops looking as soon as it sees one non-silent sample.
TRIM_ONSET_SECONDS = 0.05
# Silence kept on each side, so words neither start nor stop abruptly.
TRIM_KEEP_SECONDS = 0.1
# Under that peak the take holds no voice at all (micro coupé, mauvaise
# entrée) : trimming it would remove everything and write an empty, unplayable
# mp3, so it is transcoded as-is.
SILENT_PEAK_DBFS = -60.0


class UploadError(Exception):
    """A problem with one uploaded file, described in French: the message is
    shown as-is to the respo, in the journal of the Avancement page."""


def short(text, limit: int) -> str:
    """Texte non fiable prêt à être affiché : une seule ligne, plafonné."""
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


def parse_manifest(archive) -> list[tuple[str, str, str]]:
    """Validate the {line id: raw text} manifest and return
    (line_id, audio_member_name, raw_text) triples."""
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
    if len(manifest) > MAX_CLIPS_PER_ZIP:
        raise UploadError(f"le ZIP contient trop de clips ({len(manifest)})")

    # Validate EVERY entry before touching anything.
    audio_names = names - {"manifest.json"}
    entries = []
    for line_id, text in manifest.items():
        # fullmatch et pas match : en Python, `$` accepte aussi un saut de ligne
        # final (« abc\n » passerait), là où le SAFE_ID du navigateur le refuse.
        # Les deux gardes doivent dire exactement la même chose.
        if not LINE_ID_PATTERN.fullmatch(line_id) or not isinstance(text, str):
            raise UploadError(f"une entrée du manifest est invalide : {str({line_id: text})[:200]}")
        # The audio member is {id}.{ext} — the extension depends on the
        # recording browser, so locate it by id (ids cannot contain dots,
        # and the fullmatch keeps the member name free of path tricks).
        matches = [n for n in audio_names if re.fullmatch(re.escape(line_id) + r"\.[0-9a-zA-Z]+", n)]
        if len(matches) != 1:
            raise UploadError(
                f"le fichier audio de la réplique « {line_id} » est introuvable (ou en double) dans le ZIP"
            )
        entries.append((line_id, matches[0], text))
    return entries


def process_zip(zip_path: Path, clips_index: dict) -> int:
    """All-or-nothing merge of one ZIP. Returns the number of clips merged."""
    import zipfile

    try:
        archive = zipfile.ZipFile(zip_path)
    except (zipfile.BadZipFile, OSError) as exc:
        raise UploadError("le fichier n'est pas un ZIP valide (peut-être abîmé pendant l'envoi ?)") from exc

    with archive, tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        entries = parse_manifest(archive)

        # Phase 1: extract + transcode everything into the temp dir.
        transcoded = []  # (line_id, tmp_mp3_path, raw_text)
        for line_id, file_name, text in entries:
            raw = tmp_dir / f"in-{file_name}"
            raw.write_bytes(read_member_capped(archive, file_name, MAX_CLIP_BYTES))
            out = tmp_dir / f"{line_id}.mp3"
            transcode(raw, out)
            # La source ne sert plus (transcode l'a lue deux fois, une passe
            # volumedetect puis la conversion) : elle quitte le disque tout de
            # suite. Sans ça, le pic d'occupation du dossier temporaire est la
            # SOMME des sources, soit MAX_CLIPS_PER_ZIP x MAX_CLIP_BYTES au pire,
            # bien au-delà de ce qu'un runner a de libre. Un disque plein n'est
            # pas contenu au fichier fautif comme le reste : il emporterait
            # l'écriture de clips.json et le commit, donc les dépôts déjà fusionnés
            # dans ce run. Les mp3 produits, eux, s'accumulent forcément (c'est le
            # merge tout-ou-rien) mais pèsent 64 kbps mono.
            raw.unlink(missing_ok=True)
            transcoded.append((line_id, out, text))

        # Phase 2: everything succeeded — publish atomically-ish.
        for line_id, out, text in transcoded:
            shutil.move(str(out), str(CLIPS_DIR / f"{line_id}.mp3"))
            # Raw text at recording time; compared after normalization
            # by build_manifest.py.
            clips_index[line_id] = text
        return len(transcoded)


def count_lines(script: dict) -> int:
    return sum(len(scene["lines"]) for act in script["acts"] for scene in act["scenes"])


def validate_script(raw: bytes, current: dict) -> None:
    """Refuse un candidat qui n'est pas un script de pièce, AVANT qu'il ne
    devienne la source de vérité.

    Volontairement plus strict que `sanitize_script`, qui est un lecteur
    tolérant : ici on décide d'écraser `data/script.json`. Un JSON valide mais
    étranger (`[1, 2, 3]`, un export d'autre chose) se sanitiserait en pièce
    vide et effacerait la pièce de la troupe, d'où le garde-fou : un candidat
    sans aucune réplique ne remplace jamais une pièce qui en a."""
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
    if count_lines(sanitize_script(candidate)) == 0 and count_lines(sanitize_script(current)) > 0:
        raise UploadError(
            "ce script ne contient aucune réplique alors que la pièce en compte : "
            "refusé pour ne pas effacer la pièce"
        )


def process_script(path: Path) -> None:
    """Promote an uploaded script to data/script.json, or raise UploadError."""
    try:
        current = json.loads(SCRIPT_JSON.read_text(encoding="utf-8")) if SCRIPT_JSON.exists() else {}
    except json.JSONDecodeError:
        current = {}
    raw = path.read_bytes()
    validate_script(raw, current)
    # Octets verbatim : c'est le fichier produit par l'éditeur, et lui seul
    # porte tout (couleurs des personnages comprises : sanitize_script en recopie
    # bien la forme valide, mais il ignore tout ce qu'il ne connaît pas).
    SCRIPT_JSON.parent.mkdir(parents=True, exist_ok=True)
    SCRIPT_JSON.write_bytes(raw)


def kind_of(path: Path) -> str:
    """Type de dépôt déduit de la seule extension. Tolérant sur le nom : le
    navigateur renomme volontiers en « script (1).json » ou « voix-serge (2).zip »
    quand le fichier existe déjà dans les téléchargements."""
    suffix = path.suffix.lower()
    if suffix == ".zip":
        return "voix"
    if suffix == ".json":
        return "script"
    return "inconnu"


def main() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        clips_index = json.loads(CLIPS_JSON.read_text(encoding="utf-8")) if CLIPS_JSON.exists() else {}
        if not isinstance(clips_index, dict):
            clips_index = {}
    except json.JSONDecodeError:
        print("data/clips.json illisible — reparti de zéro", file=sys.stderr)
        clips_index = {}

    # Les fichiers cachés restent en place : `.gitkeep` tient le dossier en vie
    # dans git, il n'est pas un dépôt du respo.
    uploads = sorted(p for p in UPLOADS_DIR.iterdir() if p.is_file() and not p.name.startswith("."))

    if any(kind_of(p) == "voix" for p in uploads) and shutil.which("ffmpeg") is None:
        print("ffmpeg introuvable", file=sys.stderr)
        sys.exit(1)

    results = []
    total = 0
    for path in uploads:
        kind = kind_of(path)
        entry = {"file": short(path.name, MAX_FILENAME_CHARS), "kind": kind}
        try:
            if kind == "voix":
                count = process_zip(path, clips_index)
                total += count
                entry["clips"] = count
                print(f"{path.name}: {count} clip(s) traités")
            elif kind == "script":
                process_script(path)
                print(f"{path.name}: script promu dans data/script.json")
            else:
                raise UploadError(
                    "type de fichier inconnu : seuls les ZIP de voix et le script de la pièce "
                    "(.json) sont attendus ici"
                )
        except UploadError as exc:
            entry["error"] = short(exc, MAX_ERROR_CHARS)
            print(f"{path.name}: ERREUR — {exc}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001 — one bad file must not sink the run
            entry["error"] = f"erreur inattendue ({type(exc).__name__})"
            print(f"{path.name}: ERREUR INATTENDUE — {exc!r}", file=sys.stderr)
        finally:
            results.append(entry)
            # Traité ou fautif, le fichier quitte la zone de dépôt : les merges
            # sont idempotents par id de réplique, et un fichier cassé ne doit
            # pas échouer indéfiniment à chaque run.
            try:
                path.unlink(missing_ok=True)
            except OSError as exc:
                print(f"{path.name}: suppression impossible — {exc}", file=sys.stderr)

    write_json(CLIPS_JSON, clips_index, sort_keys=True)
    # Toujours écrit, même vide : l'étape suivante du workflow le lit sans condition.
    write_json(RESULT_PATH, results)
    failed = sum(1 for r in results if "error" in r)
    print(f"Terminé : {len(uploads)} fichier(s), {total} clip(s), {failed} erreur(s)")


if __name__ == "__main__":
    main()
