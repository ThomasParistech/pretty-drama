"""Tests du dépôt : le contrat ZIP (manifest nu `{lineId: texte brut}` + un
membre audio `{id}.{ext}` par réplique), le classement des fichiers déposés dans
`uploads/`, et la validation d'un script AVANT qu'il ne devienne la source de
vérité. Une entrée hostile lève UploadError, jamais autre chose."""

import io
import json
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import process_uploads
from process_uploads import (
    MAX_CLIPS_PER_ZIP,
    MAX_SCRIPT_BYTES,
    SILENT_PEAK_DBFS,
    TRIM_BELOW_PEAK_DB,
    UploadError,
    audio_filter,
    kind_of,
    parse_manifest,
    parse_peak_dbfs,
    read_member_capped,
    short,
    validate_script,
)


def make_archive(members: dict, manifest=None):
    """In-memory ZIP: members = {name: bytes}; manifest (if not None) is
    JSON-dumped into manifest.json."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        if manifest is not None:
            zf.writestr("manifest.json", json.dumps(manifest))
        for name, data in members.items():
            zf.writestr(name, data)
    buffer.seek(0)
    return zipfile.ZipFile(buffer)


class TestParseManifest(unittest.TestCase):
    def test_valid_zip_returns_id_member_text_triples(self):
        archive = make_archive(
            {"aaaa-1111.webm": b"x", "bbbb-2222.mp4": b"x"},
            manifest={"aaaa-1111": "Silence !", "bbbb-2222": "J'suis malade."},
        )
        self.assertEqual(
            sorted(parse_manifest(archive)),
            [
                ("aaaa-1111", "aaaa-1111.webm", "Silence !"),
                ("bbbb-2222", "bbbb-2222.mp4", "J'suis malade."),
            ],
        )

    def test_missing_manifest_is_rejected(self):
        archive = make_archive({"aaaa-1111.webm": b"x"})
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_manifest_not_json_is_rejected(self):
        archive = make_archive({"manifest.json": b"not json", "aaaa-1111.webm": b"x"})
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_old_clips_list_format_is_rejected(self):
        # Pre-{id: text} format ({character, clips: [...]}) : text values are
        # not strings -> rejected, never crashes.
        archive = make_archive(
            {"aaaa-1111.webm": b"x"},
            manifest={"character": "Serge", "clips": [{"id": "aaaa-1111", "file": "aaaa-1111.webm"}]},
        )
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_invalid_line_id_is_rejected(self):
        archive = make_archive(
            {"evil.webm": b"x"}, manifest={"../evil": "texte"}
        )
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_line_id_with_a_trailing_newline_is_rejected(self):
        # Le SAFE_ID du navigateur (mirror de LINE_ID_PATTERN) refuse « abc\n » ;
        # côté Python, `$` l'accepterait avec .match, d'où le fullmatch. Un id
        # laissé passer ici nommerait un mp3 avec un saut de ligne.
        archive = make_archive({"aaaa-1111\n.webm": b"x"}, manifest={"aaaa-1111\n": "texte"})
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_non_string_text_is_rejected(self):
        archive = make_archive({"aaaa-1111.webm": b"x"}, manifest={"aaaa-1111": 42})
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_missing_audio_member_is_rejected(self):
        archive = make_archive({}, manifest={"aaaa-1111": "texte"})
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_duplicate_audio_members_are_rejected(self):
        archive = make_archive(
            {"aaaa-1111.webm": b"x", "aaaa-1111.mp4": b"x"},
            manifest={"aaaa-1111": "texte"},
        )
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_audio_member_with_path_or_odd_extension_is_not_matched(self):
        # fullmatch keeps member names free of path tricks: "sub/aaaa-1111.webm"
        # or "aaaa-1111.webm/../x" never match the id.
        archive = make_archive(
            {"sub/aaaa-1111.webm": b"x"}, manifest={"aaaa-1111": "texte"}
        )
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_extra_unrelated_members_are_ignored(self):
        archive = make_archive(
            {"aaaa-1111.webm": b"x", "__MACOSX/junk": b"x", "notes.txt": b"x"},
            manifest={"aaaa-1111": "texte"},
        )
        self.assertEqual(parse_manifest(archive), [("aaaa-1111", "aaaa-1111.webm", "texte")])

    def test_too_many_clips_is_rejected(self):
        manifest = {f"id-{i}": "t" for i in range(MAX_CLIPS_PER_ZIP + 1)}
        archive = make_archive({}, manifest=manifest)
        with self.assertRaises(UploadError):
            parse_manifest(archive)


class TestShort(unittest.TestCase):
    """Le seul point de passage du texte NON FIABLE vers l'écran du respo : nom de
    fichier choisi par le ZIP, extrait de manifest, sortie de ffmpeg. Tout ce que
    `short` promet est consommé par une cellule de tableau (le journal des dépôts
    de l'Avancement), donc les deux propriétés comptent autant l'une que l'autre :
    une seule ligne, et une longueur bornée."""

    def test_whitespace_is_flattened_to_single_spaces(self):
        # Un saut de ligne casserait la rangée du tableau, et un journal de LaTeX
        # ou de ffmpeg en est plein.
        self.assertEqual(short("voix\nde\t serge  .zip", 100), "voix de serge .zip")

    def test_a_long_text_is_capped_and_says_so(self):
        self.assertEqual(short("a" * 12, 10), "a" * 10 + "…")

    def test_a_text_at_the_cap_is_left_alone(self):
        # Pas d'ellipse pour rien : la limite est incluse.
        self.assertEqual(short("a" * 10, 10), "a" * 10)

    def test_a_non_string_is_accepted(self):
        # Les appelants passent l'EXCEPTION elle-même (`short(exc, ...)`), pas son
        # message : sans le `str()`, la seule voie de retour du respo lèverait au
        # moment de raconter l'échec.
        self.assertEqual(short(UploadError("le ZIP est\nabîmé"), 100), "le ZIP est abîmé")


class TestReadMemberCapped(unittest.TestCase):
    """The size caps count the REAL decompressed bytes: a member whose header
    lies about its size (a highly compressible payload) must still be rejected
    once it exceeds the cap, not trusted."""

    def test_member_under_cap_is_returned(self):
        archive = make_archive({"clip.webm": b"x" * 100})
        self.assertEqual(read_member_capped(archive, "clip.webm", 200), b"x" * 100)

    def test_member_over_cap_is_rejected(self):
        # 10 kB of zeros compresses to a few bytes in the ZIP header, but the
        # real (decompressed) size is what the cap must enforce.
        archive = make_archive({"clip.webm": b"\0" * 10_000})
        with self.assertRaises(UploadError):
            read_member_capped(archive, "clip.webm", 1000)


class TestAudioFilter(unittest.TestCase):
    """The trim is peak-relative and needs a sustained onset: those two are
    what makes it work at all (see the constants' comments)."""

    def test_threshold_follows_the_peak(self):
        loud = audio_filter(-2.0)
        quiet = audio_filter(-22.0)
        self.assertIn(f"start_threshold={-2.0 - TRIM_BELOW_PEAK_DB:.1f}dB", loud)
        self.assertIn(f"start_threshold={-22.0 - TRIM_BELOW_PEAK_DB:.1f}dB", quiet)

    def test_onset_duration_is_required(self):
        # Without start_duration, the click browsers put on the first samples
        # counts as sound and nothing is trimmed at all.
        self.assertIn("start_duration=", audio_filter(-2.0))

    def test_both_ends_are_trimmed_then_normalized(self):
        chain = audio_filter(-2.0).split(",")
        self.assertEqual(len(chain), 5)
        self.assertEqual(chain[0], chain[2])
        self.assertEqual([chain[1], chain[3]], ["areverse", "areverse"])
        self.assertTrue(chain[4].startswith("loudnorm="))

    def test_silent_take_is_not_trimmed(self):
        # Trimming a take that holds no voice would remove everything and
        # write an empty, unplayable mp3.
        chain = audio_filter(SILENT_PEAK_DBFS - 1)
        self.assertNotIn("silenceremove", chain)
        self.assertTrue(chain.startswith("loudnorm="))

    def test_unknown_peak_is_not_trimmed(self):
        self.assertNotIn("silenceremove", audio_filter(None))


class TestParsePeakDbfs(unittest.TestCase):
    def test_reads_volumedetect_output(self):
        self.assertEqual(
            parse_peak_dbfs("[Parsed_volumedetect_0 @ 0x55] max_volume: -21.9 dB\n"),
            -21.9,
        )

    def test_digital_silence_and_missing_line_give_none(self):
        self.assertIsNone(parse_peak_dbfs("max_volume: -inf dB"))
        self.assertIsNone(parse_peak_dbfs("mean_volume: -30.0 dB"))
        self.assertIsNone(parse_peak_dbfs(""))


class TestKindOf(unittest.TestCase):
    """Le type d'un dépôt vient de la SEULE extension : le navigateur renomme
    volontiers « script (1).json » ou « voix-serge (2).zip »."""

    def test_extensions_decide(self):
        self.assertEqual(kind_of(Path("voix-serge.zip")), "voix")
        self.assertEqual(kind_of(Path("voix-serge (2).ZIP")), "voix")
        self.assertEqual(kind_of(Path("script.json")), "script")
        self.assertEqual(kind_of(Path("script (1).json")), "script")
        self.assertEqual(kind_of(Path("notes.txt")), "inconnu")
        self.assertEqual(kind_of(Path("voix-serge")), "inconnu")


class TestValidateScript(unittest.TestCase):
    """Garde-fou AVANT d'écraser data/script.json : plus strict que
    sanitize_script, qui n'est qu'un lecteur tolérant."""

    PLAY = {
        "title": "Pièce",
        "characters": [{"id": "c1", "name": "Serge"}],
        "acts": [{"title": "Acte I", "scenes": [{"title": "Scène 1", "lines": [
            {"id": "l1", "characterId": "c1", "text": "Silence !"}
        ]}]}],
    }

    def raw(self, obj):
        return json.dumps(obj).encode("utf-8")

    def test_a_real_script_passes(self):
        validate_script(self.raw(self.PLAY), self.PLAY)

    def test_invalid_json_is_rejected(self):
        with self.assertRaises(UploadError):
            validate_script(b"{pas du json", self.PLAY)

    def test_valid_json_that_is_not_a_script_is_rejected(self):
        # Le vrai danger : un JSON étranger se sanitiserait en pièce vide.
        for bad in ([1, 2, 3], {"foo": "bar"}, "texte", 42, None):
            with self.assertRaises(UploadError):
                validate_script(self.raw(bad), self.PLAY)

    def test_empty_play_never_replaces_a_non_empty_one(self):
        empty = {"title": "Pièce", "characters": [], "acts": []}
        with self.assertRaises(UploadError):
            validate_script(self.raw(empty), self.PLAY)

    def test_empty_play_is_accepted_when_there_is_nothing_to_lose(self):
        empty = {"title": "Pièce", "characters": [], "acts": []}
        validate_script(self.raw(empty), {})

    def test_oversized_file_is_rejected(self):
        with self.assertRaises(UploadError):
            validate_script(b"x" * (MAX_SCRIPT_BYTES + 1), self.PLAY)

    def test_non_utf8_is_rejected(self):
        with self.assertRaises(UploadError):
            validate_script(b"\xff\xfe{}", self.PLAY)


class TestProcessZip(unittest.TestCase):
    """Le merge est TOUT-OU-RIEN par ZIP : une prise qui refuse de se convertir
    ne doit laisser ni mp3 publié ni entrée dans clips.json pour les prises qui
    l'ont précédée dans le même ZIP. C'est ce qui garantit qu'un acteur ne se
    retrouve jamais avec la moitié de ses répliques en ligne.

    ffmpeg n'est pas installé dans la CI de build.yml : `transcode` est donc
    remplacé, ce qui teste exactement la partie qui nous intéresse (l'ordre des
    deux phases), sans dépendre du convertisseur."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.clips = Path(self.tmp.name) / "clips"
        self.clips.mkdir()
        self.zip_path = Path(self.tmp.name) / "voix-lea.zip"
        with zipfile.ZipFile(self.zip_path, "w") as zf:
            zf.writestr("manifest.json", json.dumps({"aaaa-1111": "Silence !", "bbbb-2222": "J'arrive."}))
            zf.writestr("aaaa-1111.webm", b"x")
            zf.writestr("bbbb-2222.webm", b"x")

    def published(self):
        return sorted(p.name for p in self.clips.iterdir())

    def test_every_clip_is_published_when_all_convert(self):
        def fake_transcode(source, dest):
            dest.write_bytes(b"mp3")

        clips_index = {"vieux-id": "déjà là"}
        with mock.patch.multiple(process_uploads, CLIPS_DIR=self.clips, transcode=fake_transcode):
            self.assertEqual(process_uploads.process_zip(self.zip_path, clips_index), 2)
        self.assertEqual(self.published(), ["aaaa-1111.mp3", "bbbb-2222.mp3"])
        # Texte BRUT au moment de l'enregistrement (la normalisation n'a lieu
        # que dans build_manifest), et les clips déjà là sont conservés.
        self.assertEqual(
            clips_index, {"vieux-id": "déjà là", "aaaa-1111": "Silence !", "bbbb-2222": "J'arrive."}
        )

    def test_one_failed_conversion_publishes_nothing_at_all(self):
        calls = []

        def failing_transcode(source, dest):
            calls.append(source.name)
            if len(calls) == 1:
                dest.write_bytes(b"mp3")
                return
            raise UploadError("la conversion audio a échoué")

        clips_index = {"vieux-id": "déjà là"}
        with mock.patch.multiple(process_uploads, CLIPS_DIR=self.clips, transcode=failing_transcode):
            with self.assertRaises(UploadError):
                process_uploads.process_zip(self.zip_path, clips_index)
        # Ni la prise convertie avant l'échec ni la suivante : rien n'est publié,
        # et l'index n'a pas bougé.
        self.assertEqual(self.published(), [])
        self.assertEqual(clips_index, {"vieux-id": "déjà là"})

    def test_a_corrupted_archive_is_an_upload_error(self):
        broken = Path(self.tmp.name) / "abime.zip"
        broken.write_bytes(b"pas un zip du tout")
        with mock.patch.object(process_uploads, "CLIPS_DIR", self.clips):
            with self.assertRaises(UploadError):
                process_uploads.process_zip(broken, {})


class TestMain(unittest.TestCase):
    """Le script tel que le workflow l'appelle, sur un vrai dossier `uploads/`.

    Aucun ZIP valide ici : les transcoder demanderait ffmpeg, que la CI n'installe
    que dans uploads.yml quand il y a des voix à traiter. Un ZIP illisible échoue
    avant tout appel à ffmpeg, donc `shutil.which` est le seul point à neutraliser
    (sans lui, la garde « ffmpeg introuvable » sortirait en erreur)."""

    PLAY = {
        "title": "Pièce",
        # La couleur mal formée est ce que sanitize_script laisse tomber (il ne
        # recopie que la forme `#rrggbb`) : elle prouve que la promotion écrit
        # bien les octets déposés, et pas une version relue.
        "characters": [{"id": "c1", "name": "Serge", "color": "bleu de Prusse"}],
        "acts": [
            {
                "title": "Acte I",
                "scenes": [
                    {"title": "Scène 1", "lines": [{"id": "l1", "characterId": "c1", "text": "Silence !"}]}
                ],
            }
        ],
    }

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.uploads = root / "uploads"
        self.uploads.mkdir()
        self.clips = root / "clips"
        self.result = root / "uploads_result.json"
        self.script = root / "data" / "script.json"
        self.addCleanup(self.tmp.cleanup)

    def run_main(self):
        with mock.patch.multiple(
            process_uploads,
            UPLOADS_DIR=self.uploads,
            CLIPS_DIR=self.clips,
            CLIPS_JSON=Path(self.tmp.name) / "data" / "clips.json",
            RESULT_PATH=self.result,
            SCRIPT_JSON=self.script,
        ), mock.patch.object(process_uploads.shutil, "which", return_value="/usr/bin/ffmpeg"):
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                process_uploads.main()
        return json.loads(self.result.read_text(encoding="utf-8"))

    def test_each_file_gets_its_own_kind_and_outcome(self):
        raw = json.dumps(self.PLAY, ensure_ascii=False).encode("utf-8")
        (self.uploads / ".gitkeep").write_text("", encoding="utf-8")
        (self.uploads / "script.json").write_bytes(raw)
        (self.uploads / "voix-lea.zip").write_bytes(b"pas un zip du tout")
        (self.uploads / "notes.txt").write_text("penser aux costumes", encoding="utf-8")

        results = {entry["file"]: entry for entry in self.run_main()}

        self.assertEqual(set(results), {"script.json", "voix-lea.zip", "notes.txt"})
        # Le script est promu, verbatim (la couleur mal formée a survécu).
        self.assertEqual(results["script.json"], {"file": "script.json", "kind": "script"})
        self.assertEqual(self.script.read_bytes(), raw)
        # Chaque fichier porte SON propre échec, avec son propre motif.
        self.assertEqual(results["voix-lea.zip"]["kind"], "voix")
        self.assertIn("ZIP", results["voix-lea.zip"]["error"])
        self.assertEqual(results["notes.txt"]["kind"], "inconnu")
        self.assertIn("inconnu", results["notes.txt"]["error"])

    def test_the_drop_zone_is_emptied_except_hidden_files(self):
        (self.uploads / ".gitkeep").write_text("", encoding="utf-8")
        (self.uploads / "voix-lea.zip").write_bytes(b"pas un zip du tout")
        (self.uploads / "notes.txt").write_text("x", encoding="utf-8")
        self.run_main()
        # `.gitkeep` tient le dossier en vie dans git : il n'est pas un dépôt.
        self.assertEqual([p.name for p in self.uploads.iterdir()], [".gitkeep"])

    def test_a_refused_script_leaves_the_play_untouched(self):
        self.script.parent.mkdir(parents=True, exist_ok=True)
        before = json.dumps(self.PLAY, ensure_ascii=False).encode("utf-8")
        self.script.write_bytes(before)
        (self.uploads / "export.json").write_text("[1, 2, 3]", encoding="utf-8")
        results = self.run_main()
        self.assertIn("error", results[0])
        self.assertEqual(self.script.read_bytes(), before)

    def test_an_empty_drop_zone_still_writes_a_result(self):
        # Le workflow lit uploads_result.json sans condition à l'étape suivante.
        self.assertEqual(self.run_main(), [])


if __name__ == "__main__":
    unittest.main()
