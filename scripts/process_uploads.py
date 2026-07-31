"""Process everything the respo drops in uploads/ : voice ZIPs and scripts.

**Une zone de dépôt par pièce**, `uploads/<id de la pièce>/`, et c'est le DOSSIER
qui route le fichier, jamais son contenu. C'est ce qui fait qu'un ZIP abîmé, donc
illisible, atterrit quand même dans le journal de sa pièce : un fichier qu'on ne
peut pas ouvrir ne peut pas dire de quelle pièce il est. Le respo ne tape jamais ce
chemin, il clique le bouton de dépôt de la pièce où il travaille.

L'identifiant que le fichier porte (le champ `id` d'un script, le champ `play` du
manifest d'un ZIP) sert donc à VÉRIFIER et non à router : un fichier qui nomme une
autre pièce que celle de sa zone de dépôt est refusé avec un motif lisible, plutôt
que d'écrire les voix ou le script d'une pièce par-dessus une autre.

Le type est déduit de l'extension : `.zip` = voix d'un acteur, `.json` = script de
la pièce. Les fichiers cachés sont laissés en place (`.gitkeep`, qui tient la zone
de dépôt en vie dans git), tout autre fichier est signalé au journal puis retiré (le
laisser le ferait re-signaler à chaque run).

**Une pièce naît d'un dépôt de script**, dans une zone de dépôt qui ne correspond
encore à aucune pièce : le dossier est alors créé avec le script promu dedans. Deux
chemins y mènent, et le second est un filet :
 - `uploads/<nouvel id>/script.json`, ce que propose la page de gestion des pièces ;
 - `uploads/script.json` à la racine, routé par le seul `id` du fichier, pour le cas
   où GitHub refuserait de servir sa page d'envoi sur un dossier qu'il ne connaît pas
   encore, et pour le respo qui déposerait par habitude à l'ancienne adresse.
Un ZIP de voix, lui, n'est jamais accepté à la racine : des voix concernent toujours
une pièce qui existe, et cette pièce porte son propre bouton de dépôt.

Ce qu'aucune pièce ne réclame (fichier posé à la racine sans identifiant lisible,
dossier de dépôt dont le nom n'est pas un identifiant valide) est consigné dans le
journal RACINE, `data/history.json`, affiché par la page de gestion des pièces. Le
journal est le seul canal de retour du projet : un fichier refusé se dit toujours
quelque part, sans pour autant faire entrer les dépôts d'une pièce dans le journal
d'une autre.

Corollaire important : `script.json` n'est plus déposé à la main par-dessus la
source de vérité. Il arrive dans une zone de dépôt, est **validé** ici, et n'est
promu qu'ensuite (cf. `validate_script`). Un fichier illisible ou qui n'est pas
un script devient donc une ligne de journal, plus un workflow en échec avec la
pièce écrasée. Les octets sont écrits **verbatim** : passer par
`sanitize_script` perdrait ce qu'il ignore (les couleurs des personnages).

For each ZIP:
 - read its manifest.json ({play: id de la pièce, clips: {line id: raw text}}) —
   the text is the RAW line text at recording time; normalization happens ONLY
   here in the Action (single implementation), never in the browser. The audio
   member is named {id}.{ext} (extension chosen by the recording browser),
   so it is located from the id alone. `play` ne route pas le dépôt (le dossier
   où le fichier est posé le fait), il le VÉRIFIE : un ZIP qui nomme une autre
   pièce que celle de sa zone de dépôt est refusé.
 - VALIDATE the whole manifest first, then transcode every clip with ffmpeg
   in a single pass (leading/trailing silence trim + loudness normalization +
   mp3 mono ~64 kbps) into a temp dir, and only if EVERY clip succeeded,
   publish the play's clips/{id}.mp3 and update its data/clips.json
   ({line id: raw text}).
   A ZIP is merged entirely or not at all — never half.
 - delete the processed ZIP (idempotent merge: re-sending a clip for the same
   line id simply overwrites it)

Faulty files (corrupted ZIP, missing manifest, ffmpeg failure, oversized,
unreadable script) are also removed — otherwise they would fail on every
subsequent run. ANY exception on one file is contained: it must not block the
other files nor lose the updates already merged in this run.

Le sort de CHAQUE fichier (succès comme erreur) est écrit dans uploads_result.json,
rangé par pièce, que update_history.py consigne dans le journal de chaque pièce (ou
dans celui de la racine) : c'est le seul retour du respo, qui ne lit ni les logs de la
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


def parse_manifest(archive) -> tuple[str, list[tuple[str, str, str]]]:
    """Validate the ZIP's manifest and return (declared play id,
    (line_id, audio_member_name, raw_text) triples).

    Deux formes acceptées, et c'est délibéré :
     - `{"play": "<id>", "clips": {id de réplique: texte brut}}`, celle que la page
       Enregistrement écrit ;
     - le mapping NU `{id de réplique: texte brut}` des ZIP téléchargés avant que
       le dépôt sache héberger plusieurs pièces. Un acteur peut avoir le sien dans
       ses téléchargements depuis des semaines, et il n'y a rien à gagner à le lui
       refuser : il rend un identifiant de pièce vide, donc aucune vérification, et
       c'est le dossier de dépôt qui décide, comme pour tous les autres.

    L'identifiant rendu est une VÉRIFICATION, jamais un routage (cf. `downloadZip`
    dans src/recorder/App.jsx) : vide, il ne dit rien et ne bloque rien.

    Limite connue et acceptée : un ZIP de l'ancienne forme dont une réplique
    porterait l'id « play » ou « clips » serait lu comme la forme nommée, donc
    refusé avec un motif de format. Les ids que l'éditeur mint sont des UUID, et le
    prix d'un id hand-édité aussi malheureux est un message d'erreur, jamais un
    mp3 écrit au mauvais endroit.
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

    # Laquelle des deux formes ? La présence de l'une des deux clés nommées suffit
    # à trancher, et elle donne un message de format franc quand l'autre manque, là
    # où retomber sur le mapping nu ferait chercher un fichier audio nommé
    # « clips.webm ». C'est aussi ce qui continue de refuser la forme d'avant
    # celle-ci (`{character, clips: [...]}`), dont les clips étaient une LISTE.
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
    return play, entries


def process_zip(zip_path: Path, clips_index: dict, clips_dir: Path, expected_play: str = "") -> int:
    """All-or-nothing merge of one ZIP. Returns the number of clips merged.

    `clips_dir` est le dossier de clips de la pièce (`plays/<id>/clips/`) : il arrive
    en argument et n'est plus un chemin de module, chaque pièce ayant le sien.

    `expected_play` est la pièce dont ce ZIP alimente la zone de dépôt. Le ZIP est
    refusé quand il en nomme une AUTRE : ses mp3 sont nommés par id de réplique,
    donc les fusionner ici écrirait les voix d'une pièce sous les répliques d'une
    autre, et personne ne s'en apercevrait avant la répétition. Vide (ZIP d'avant ce
    champ, ou pièce sans identifiant), il n'y a rien à vérifier."""
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
    """Refuse un candidat qui n'est pas un script de pièce, AVANT qu'il ne
    devienne la source de vérité.

    Volontairement plus strict que `sanitize_script`, qui est un lecteur
    tolérant : ici on décide d'écraser le `script.json` d'une pièce. Un JSON valide mais
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
    # Même vérification que pour un ZIP de voix, et pour la même raison : le
    # fichier nomme sa pièce, le dossier où il est posé la nomme aussi, et les
    # faire se contredire écraserait le script d'une pièce par celui d'une autre.
    # Un identifiant vide (script téléchargé avant que ce champ existe) ne dit rien
    # et ne bloque rien : c'est le dossier qui décide.
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

    `script_path` est la destination (`plays/<id>/data/script.json`). Elle arrive en
    argument et n'est plus un chemin de module : c'est le dossier de dépôt qui
    désigne la pièce, et cette destination peut ne pas exister encore, un dépôt de
    script étant ce qui CRÉE une pièce."""
    current = load_json(script_path, {})
    if not isinstance(current, dict):
        current = {}
    raw = path.read_bytes()
    validate_script(raw, current, expected_play)
    # Octets verbatim : c'est le fichier produit par l'éditeur, et lui seul
    # porte tout (couleurs des personnages comprises : sanitize_script en recopie
    # bien la forme valide, mais il ignore tout ce qu'il ne connaît pas).
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_bytes(raw)


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


def deposited_files(folder: Path) -> list[Path]:
    """Les fichiers déposés dans une zone. Les fichiers cachés restent en place :
    `.gitkeep` tient la zone en vie dans git, il n'est pas un dépôt du respo.

    Les scripts passent AVANT les voix, et ce n'est pas cosmétique : un script est ce
    qui fait naître une pièce, donc dans un dépôt qui porte les deux, c'est lui qui
    crée le dossier auquel les voix se rattachent. Dans l'ordre alphabétique nu, un
    ZIP nommé « autre.zip » serait passé le premier et aurait été refusé."""
    if not folder.is_dir():
        return []
    files = (p for p in folder.iterdir() if p.is_file() and not p.name.startswith("."))
    return sorted(files, key=lambda p: (0 if kind_of(p) == "script" else 1, p.name))


def ensure_play_layout(play_id: str) -> None:
    """Le silo d'une pièce qui vient de naître : son dossier de clips et sa zone de
    dépôt.

    Les `.gitkeep` ne sont pas cosmétiques. Git ne versionne pas un dossier vide, et
    ces deux dossiers doivent EXISTER dans le dépôt avant qu'on en ait besoin : la
    zone de dépôt parce que c'est elle que vise le bouton de dépôt de la pièce, et
    GitHub ne sert sa page d'envoi que sur un dossier qu'il connaît ; le dossier de
    clips parce que le site le recopie tel quel au déploiement."""
    for folder in (play_clips_dir(play_id), play_uploads_dir(play_id)):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / ".gitkeep").touch()


def consume(path: Path) -> None:
    """Traité ou fautif, le fichier quitte la zone de dépôt : les merges sont
    idempotents par id de réplique, et un fichier cassé ne doit pas échouer
    indéfiniment à chaque run."""
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        print(f"{path.name}: suppression impossible — {exc}", file=sys.stderr)


def record(entries: list[dict], path: Path, kind: str, work) -> int:
    """Exécute le traitement d'UN fichier et consigne son sort, quoi qu'il arrive.

    Rend le nombre de clips fusionnés (zéro pour un script). Toute exception est
    contenue ici : un fichier fautif ne doit ni bloquer les autres fichiers, ni faire
    perdre les dépôts déjà fusionnés dans ce run, et son motif finit affiché au respo
    dans le journal de sa pièce."""
    entry = {"file": short(path.name, MAX_FILENAME_CHARS), "kind": kind}
    clips = 0
    try:
        clips = work() or 0
        if kind == "voix":
            entry["clips"] = clips
    except UploadError as exc:
        entry["error"] = short(exc, MAX_ERROR_CHARS)
        print(f"{path.name}: ERREUR — {exc}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001 — one bad file must not sink the run
        entry["error"] = f"erreur inattendue ({type(exc).__name__})"
        print(f"{path.name}: ERREUR INATTENDUE — {exc!r}", file=sys.stderr)
    finally:
        entries.append(entry)
        consume(path)
    return clips


def process_play_zone(play_id: str, files: list[Path]) -> tuple[list[dict], int]:
    """Traite la zone de dépôt d'une pièce. Rend (lignes de journal, clips fusionnés).

    La pièce peut ne pas exister encore : une zone de dépôt qui ne correspond à
    aucune pièce est le canal de CRÉATION, et seul un script y est accepté. Des voix y
    sont refusées, il n'y a aucune réplique à quoi les rattacher.
    """
    data = play_data_dir(play_id)
    script_json = data / "script.json"
    clips_json = data / "clips.json"
    clips_index = load_json(
        clips_json, {}, f"plays/{play_id}/data/clips.json illisible — reparti de zéro"
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
                print(f"{path.name}: {count} clip(s) traités pour « {play_id} »")
                return count
            if kind == "script":
                created = not script_json.exists()
                process_script(path, script_json, play_id)
                if created:
                    ensure_play_layout(play_id)
                    print(f"{path.name}: pièce « {play_id} » créée")
                else:
                    print(f"{path.name}: script promu dans plays/{play_id}/data/script.json")
                return 0
            raise UploadError(
                "type de fichier inconnu : seuls les ZIP de voix et le script de la pièce "
                "(.json) sont attendus ici"
            )

        total += record(entries, path, kind, work)

    # Écrit seulement si la pièce EXISTE : sans ce garde, une zone de dépôt créée
    # avec une faute de frappe et remplie d'un seul fichier fautif fabriquerait un
    # dossier de pièce, donc une pièce fantôme dans le sélecteur de la troupe.
    if script_json.exists():
        write_json(clips_json, clips_index, sort_keys=True)
    return entries, total


def claimed_play_id(path: Path) -> str:
    """La pièce qu'un fichier posé à la RACINE d'`uploads/` revendique.

    C'est le seul endroit où le CONTENU route, faute d'un dossier pour le faire, et
    seul un script sait le dire (son champ `id`). Rend la chaîne vide dès que le
    fichier ne le dit pas lisiblement : l'appelant consigne alors la ligne dans le
    journal racine, qui est fait pour ça.
    """
    if kind_of(path) != "script":
        return ""
    try:
        # Plafonné comme dans `validate_script` : ce fichier n'est pas fiable, et un
        # candidat trop gros sera de toute façon refusé plus loin.
        candidate = json.loads(path.read_bytes()[: MAX_SCRIPT_BYTES + 1].decode("utf-8"))
    except (OSError, ValueError):
        return ""
    if not isinstance(candidate, dict) or not is_play_id(candidate.get("id")):
        return ""
    return candidate["id"]


def process_root_zone(files: list[Path]) -> tuple[dict[str, list[dict]], list[dict], int]:
    """La racine d'`uploads/` : le canal de création, et le filet du respo.

    Rend (lignes par pièce, lignes non routables, clips fusionnés). Un script y est
    routé par son seul identifiant, vers une pièce existante comme vers une pièce à
    créer. Tout le reste est non routable, et le dit.
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
            # La pièce existe forcément si le script a été promu ; refusé, elle n'a
            # aucun journal où se dire et la ligne rejoint la racine.
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
    """Une zone de dépôt dont le nom n'est pas un identifiant de pièce valide.

    Elle a été créée à la main : aucun fichier ne peut la désigner, et le site ne
    saurait pas écrire l'URL de la pièce qu'elle prétend nommer. Ses fichiers sont
    consignés puis retirés, comme tout dépôt fautif, et ils le sont dans le journal
    racine, seul endroit qui puisse encore le dire au respo."""
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

    # Le relevé des zones AVANT tout traitement : une zone par dossier, plus la
    # racine. Un dossier vide ne compte pas (il ne porte que son `.gitkeep`).
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
        print("ffmpeg introuvable", file=sys.stderr)
        sys.exit(1)

    # Le journal est tenu PAR PIÈCE (chaque pièce ignore les dépôts des autres), plus
    # un journal racine pour ce qu'aucune pièce ne réclame.
    results: dict = {"plays": {}, "unrouted": []}
    total = 0
    for play_id, files in zones.items():
        entries, count = process_play_zone(play_id, files)
        total += count
        # Une zone qui n'a pas réussi à faire naître sa pièce n'a pas de journal où
        # écrire : ses lignes vont à la racine.
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

    # Toujours écrit, même vide : l'étape suivante du workflow le lit sans condition.
    write_json(RESULT_PATH, results)
    lines = [e for entries in results["plays"].values() for e in entries] + results["unrouted"]
    failed = sum(1 for e in lines if "error" in e)
    print(f"Terminé : {len(lines)} fichier(s), {total} clip(s), {failed} erreur(s)")


if __name__ == "__main__":
    main()
