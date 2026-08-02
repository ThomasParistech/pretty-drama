"""The ZIP contract, the routing of uploaded files, and script validation before
promotion. A hostile input raises UploadError, never anything else."""

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

import common
import process_uploads
from build_manifest import DEFAULT_LANGUAGE
from process_uploads import (
    MAX_CLIPS_PER_ZIP,
    MAX_SCRIPT_BYTES,
    MAX_TITLE_BYTES,
    SILENT_PEAK_DBFS,
    TRIM_BELOW_PEAK_DB,
    UploadError,
    audio_filter,
    create_play,
    kind_of,
    parse_manifest,
    parse_peak_dbfs,
    read_member_capped,
    read_title,
    short,
    validate_script,
)


def make_archive(members: dict, manifest=None):
    """In-memory ZIP: members = {name: bytes}, manifest dumped into manifest.json."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        if manifest is not None:
            zf.writestr("manifest.json", json.dumps(manifest))
        for name, data in members.items():
            zf.writestr(name, data)
    buffer.seek(0)
    return zipfile.ZipFile(buffer)


class TestParseManifest(unittest.TestCase):
    def test_valid_zip_returns_the_play_and_id_member_text_triples(self):
        archive = make_archive(
            {"aaaa-1111.webm": b"x", "bbbb-2222.mp4": b"x"},
            manifest={
                "play": "le-malade",
                "clips": {"aaaa-1111": "Silence !", "bbbb-2222": "J'suis malade."},
            },
        )
        play, entries = parse_manifest(archive)
        self.assertEqual(play, "le-malade")
        self.assertEqual(
            sorted(entries),
            [
                ("aaaa-1111", "aaaa-1111.webm", "Silence !"),
                ("bbbb-2222", "bbbb-2222.mp4", "J'suis malade."),
            ],
        )

    def test_the_bare_legacy_manifest_is_still_accepted(self):
        # Pre-multi-play ZIP: the manifest IS the mapping and names no play.
        archive = make_archive(
            {"aaaa-1111.webm": b"x"}, manifest={"aaaa-1111": "Silence !"}
        )
        self.assertEqual(
            parse_manifest(archive), ("", [("aaaa-1111", "aaaa-1111.webm", "Silence !")])
        )

    def test_an_empty_play_id_declares_nothing(self):
        archive = make_archive(
            {"aaaa-1111.webm": b"x"}, manifest={"play": "", "clips": {"aaaa-1111": "t"}}
        )
        self.assertEqual(parse_manifest(archive)[0], "")

    def test_an_invalid_play_id_is_rejected(self):
        # The identifier becomes a path `plays/<id>/`.
        for bad in ("../evil", "Le-Malade", "le malade", "-malade", "x" * 65, 42):
            archive = make_archive(
                {"aaaa-1111.webm": b"x"}, manifest={"play": bad, "clips": {"aaaa-1111": "t"}}
            )
            with self.assertRaises(UploadError):
                parse_manifest(archive)

    def test_a_named_manifest_without_its_clips_mapping_is_rejected(self):
        archive = make_archive({"aaaa-1111.webm": b"x"}, manifest={"play": "le-malade"})
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_missing_manifest_is_rejected(self):
        archive = make_archive({"aaaa-1111.webm": b"x"})
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_manifest_not_json_is_rejected(self):
        archive = make_archive({"manifest.json": b"not json", "aaaa-1111.webm": b"x"})
        with self.assertRaises(UploadError):
            parse_manifest(archive)

    def test_old_clips_list_format_is_rejected(self):
        # Pre-{id: text} format: rejected, never a crash.
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
        # `$` with .match would accept it, hence the fullmatch; SAFE_ID agrees.
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
        self.assertEqual(parse_manifest(archive), ("", [("aaaa-1111", "aaaa-1111.webm", "texte")]))

    def test_too_many_clips_is_rejected(self):
        manifest = {f"id-{i}": "t" for i in range(MAX_CLIPS_PER_ZIP + 1)}
        archive = make_archive({}, manifest=manifest)
        with self.assertRaises(UploadError):
            parse_manifest(archive)


class TestShort(unittest.TestCase):
    """The only path from untrusted text to the coordinator's screen, and it lands in
    a table cell: one line, bounded length."""

    def test_whitespace_is_flattened_to_single_spaces(self):
        # An ffmpeg log is full of line breaks, and one would break the table row.
        self.assertEqual(short("voix\nde\t serge  .zip", 100), "voix de serge .zip")

    def test_a_long_text_is_capped_and_says_so(self):
        self.assertEqual(short("a" * 12, 10), "a" * 10 + "…")

    def test_a_text_at_the_cap_is_left_alone(self):
        self.assertEqual(short("a" * 10, 10), "a" * 10)

    def test_a_non_string_is_accepted(self):
        # Callers pass the exception itself, `short(exc, ...)`, not its message.
        self.assertEqual(short(UploadError("le ZIP est\nabîmé"), 100), "le ZIP est abîmé")


class TestReadMemberCapped(unittest.TestCase):
    """Size caps count the real decompressed bytes: ZIP headers lie."""

    def test_member_under_cap_is_returned(self):
        archive = make_archive({"clip.webm": b"x" * 100})
        self.assertEqual(read_member_capped(archive, "clip.webm", 200), b"x" * 100)

    def test_member_over_cap_is_rejected(self):
        # 10 kB of zeros is a few bytes in the header.
        archive = make_archive({"clip.webm": b"\0" * 10_000})
        with self.assertRaises(UploadError):
            read_member_capped(archive, "clip.webm", 1000)


class TestAudioFilter(unittest.TestCase):
    """The trim is peak-relative and needs a sustained onset."""

    def test_threshold_follows_the_peak(self):
        loud = audio_filter(-2.0)
        quiet = audio_filter(-22.0)
        self.assertIn(f"start_threshold={-2.0 - TRIM_BELOW_PEAK_DB:.1f}dB", loud)
        self.assertIn(f"start_threshold={-22.0 - TRIM_BELOW_PEAK_DB:.1f}dB", quiet)

    def test_onset_duration_is_required(self):
        # Without it, the browser's opening click counts as sound and nothing trims.
        self.assertIn("start_duration=", audio_filter(-2.0))

    def test_both_ends_are_trimmed_then_normalized(self):
        chain = audio_filter(-2.0).split(",")
        self.assertEqual(len(chain), 5)
        self.assertEqual(chain[0], chain[2])
        self.assertEqual([chain[1], chain[3]], ["areverse", "areverse"])
        self.assertTrue(chain[4].startswith("loudnorm="))

    def test_silent_take_is_not_trimmed(self):
        # Trimming a voiceless take writes an empty, unplayable mp3.
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
    """The type comes from the extension alone: browsers rename to "script (1).json"."""

    def test_extensions_decide(self):
        self.assertEqual(kind_of(Path("voix-serge.zip")), "voix")
        self.assertEqual(kind_of(Path("voix-serge (2).ZIP")), "voix")
        self.assertEqual(kind_of(Path("script.json")), "script")
        self.assertEqual(kind_of(Path("script (1).json")), "script")
        self.assertEqual(kind_of(Path("notes.txt")), "inconnu")
        self.assertEqual(kind_of(Path("voix-serge")), "inconnu")

    def test_the_creation_zone_owes_nothing_to_the_extension(self):
        # `uploads/_new-play/` files never reach this function; the zone files them.
        self.assertEqual(kind_of(Path("antigone.txt")), "inconnu")
        self.assertEqual(kind_of(Path("Antigone")), "inconnu")


class TestReadTitle(unittest.TestCase):
    """One text file, one line, the play's title. Strict where the rest of the
    module is tolerant: a pasted note must not become a play's name."""

    def file(self, content: bytes) -> Path:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "titre.txt"
        path.write_bytes(content)
        return path

    def test_the_whole_content_is_the_title(self):
        self.assertEqual(read_title(self.file("Antigone".encode("utf-8"))), "Antigone")

    def test_the_trailing_newline_of_a_text_file_is_not_a_second_line(self):
        for content in (b"Antigone\n", b"Antigone\r\n", b"  Antigone  \n\n"):
            self.assertEqual(read_title(self.file(content)), "Antigone")

    def test_a_windows_byte_order_mark_is_not_part_of_the_title(self):
        # Left in, it makes a leading hyphen that PLAY_ID_PATTERN refuses.
        self.assertEqual(read_title(self.file(b"\xef\xbb\xbfAntigone\n")), "Antigone")

    def test_a_title_with_accents_travels_whole(self):
        self.assertEqual(read_title(self.file("L'École des femmes\n".encode("utf-8"))), "L'École des femmes")

    def test_an_empty_file_is_rejected(self):
        for content in (b"", b"\n", b"   \n  \n"):
            with self.assertRaises(UploadError):
                read_title(self.file(content))

    def test_several_lines_are_rejected(self):
        with self.assertRaises(UploadError):
            read_title(self.file("penser aux costumes\net aux perruques\n".encode("utf-8")))

    def test_everything_past_the_separator_is_a_note_and_not_data(self):
        # The shape the site writes; even a second `---` below changes nothing.
        content = (
            "L'École des femmes\n"
            "---\n"
            "Ce fichier crée la pièce dont le titre est écrit au-dessus de la ligne.\n"
            "\n"
            "Enregistrez-le tel quel.\n"
            "---\n"
        )
        self.assertEqual(read_title(self.file(content.encode("utf-8"))), "L'École des femmes")

    def test_the_separator_is_recognised_around_its_own_whitespace(self):
        for line in ("---", "  ---  ", "---\t"):
            content = f"Antigone\n{line}\nune note\n"
            with self.subTest(line=line):
                self.assertEqual(read_title(self.file(content.encode("utf-8"))), "Antigone")

    def test_a_second_line_before_the_separator_is_rejected(self):
        # The reason names the separator, so there is something to look for.
        with self.assertRaises(UploadError) as caught:
            read_title(self.file(b"Antigone\nde Sophocle\n---\nune note\n"))
        self.assertIn("---", str(caught.exception))

    def test_a_file_that_is_only_a_note_carries_no_title(self):
        with self.assertRaises(UploadError):
            read_title(self.file(b"---\nCe fichier cree la piece...\n"))

    def test_a_title_may_start_with_any_character(self):
        # Why the separator is a line of its own and not a per-line marker.
        for title in ("#Balance", "// Titre", "; Titre", "-- Titre"):
            with self.subTest(title):
                self.assertEqual(read_title(self.file(f"{title}\n---\nnote\n".encode())), title)

    def test_an_oversized_file_is_rejected(self):
        with self.assertRaises(UploadError):
            read_title(self.file(b"x" * (MAX_TITLE_BYTES + 1)))

    def test_non_utf8_is_rejected(self):
        with self.assertRaises(UploadError):
            read_title(self.file(b"\xff\xfeAntigone"))


class TestCreatePlay(unittest.TestCase):
    """One file of the creation zone, and the moment the play is NAMED."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.plays = root / "plays"
        self.addCleanup(self.tmp.cleanup)
        # Both paths: `create_play` lays out the silo, upload zone included.
        patch = mock.patch.multiple(common, PLAYS_DIR=self.plays, UPLOADS_DIR=root / "uploads")
        patch.start()
        self.addCleanup(patch.stop)

    def file(self, content: str, name: str = "titre.txt") -> Path:
        """A file of `uploads/_new-play/`; its name is varied on purpose."""
        folder = Path(self.tmp.name) / "uploads" / process_uploads.NEW_PLAY_DIR
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / name
        path.write_text(content, encoding="utf-8")
        return path

    def script(self, title: str, name: str = "titre.txt") -> dict:
        play_id, _ = create_play(self.file(f"{title}\n", name))
        return json.loads((self.plays / play_id / "data" / "script.json").read_text("utf-8"))

    def test_the_identifier_is_derived_from_the_title(self):
        play_id, changes = create_play(self.file("L'École des femmes\n"))
        self.assertEqual(play_id, "l-ecole-des-femmes")
        self.assertEqual(changes, {"created": True})  # nothing to count yet

    def test_the_name_of_the_file_is_never_read(self):
        # On GitHub the name is an editable field. One title per case: two files
        # sharing one would collide, as tested below.
        for name, title, play_id in (
            ("titre.txt", "Antigone", "antigone"),
            ("Antigone", "Le Cid", "le-cid"),
            ("hamlet.md", "Phèdre", "phedre"),
            ("sans-extension.", "Ubu roi", "ubu-roi"),
            ("x y z.TXT", "Tartuffe", "tartuffe"),
        ):
            with self.subTest(name):
                self.assertEqual(self.script(title, name)["id"], play_id)

    def test_the_title_is_kept_as_typed(self):
        # The identifier is folded, the title is not.
        self.assertEqual(self.script("L'École des femmes")["title"], "L'École des femmes")

    def test_the_play_is_empty_and_carries_a_scene_to_write_in(self):
        fresh = self.script("Antigone")
        self.assertEqual(fresh["characters"], [])
        self.assertEqual(fresh["acts"], [{"scenes": [{"lines": []}]}])

    def test_the_language_is_the_project_default(self):
        # The reader's locale is not the play's language; the Editor rail sets it.
        self.assertEqual(self.script("Antigone")["language"], DEFAULT_LANGUAGE)

    def test_the_silo_of_the_new_play_is_laid_out(self):
        play_id, _ = create_play(self.file("Antigone\n"))
        self.assertTrue((self.plays / play_id / "clips" / ".gitkeep").exists())

    def test_a_title_that_leaves_no_address_is_rejected(self):
        # Rather than fabricate a "piece-1" that lives forever in the troupe's URL.
        for title in ("???", "---", "..."):
            with self.subTest(title):
                with self.assertRaises(UploadError):
                    create_play(self.file(f"{title}\n"))
        self.assertFalse(self.plays.exists(), "no phantom play folder")

    def written_play(self, play_id: str, title: str, lines: list) -> bytes:
        """A play already at that address; returns the bytes it must still hold."""
        data = self.plays / play_id / "data"
        data.mkdir(parents=True)
        raw = json.dumps(
            {"id": play_id, "title": title, "acts": [{"scenes": [{"lines": lines}]}]},
            ensure_ascii=False,
        ).encode("utf-8")
        (data / "script.json").write_bytes(raw)
        return raw

    def test_an_address_already_taken_is_refused(self):
        before = self.written_play(
            "antigone", "Antigone", [{"id": "l1", "characterId": "c1", "text": "Non."}]
        )
        with self.assertRaises(UploadError) as caught:
            create_play(self.file("Antigone\n"))
        # The safeguard behind it would speak of a script with no line instead.
        self.assertIn("antigone", str(caught.exception))
        self.assertEqual((self.plays / "antigone" / "data" / "script.json").read_bytes(), before)

    def test_two_titles_that_fold_onto_the_same_address_collide(self):
        # The identifier is a folding, so a collision needs no identical title.
        before = self.written_play("l-ecole-des-femmes", "L'École des femmes", [])
        with self.assertRaises(UploadError):
            create_play(self.file("L'Ecole des femmes\n"))
        # A play with no line yet is protected too, which the safeguard alone is not.
        path = self.plays / "l-ecole-des-femmes" / "data" / "script.json"
        self.assertEqual(path.read_bytes(), before)


class TestValidateScript(unittest.TestCase):
    """Safeguard before overwriting script.json, stricter than sanitize_script."""

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
        # A foreign JSON would sanitize into an empty play.
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

    def test_a_script_naming_another_play_is_rejected(self):
        # File and folder both name a play; a contradiction would overwrite the wrong one.
        other = {**self.PLAY, "id": "le-malade"}
        with self.assertRaises(UploadError):
            validate_script(self.raw(other), self.PLAY, expected_play="transport-de-femmes")

    def test_a_script_naming_its_own_play_passes(self):
        same = {**self.PLAY, "id": "le-malade"}
        validate_script(self.raw(same), self.PLAY, expected_play="le-malade")

    def test_a_script_without_an_id_is_accepted_where_it_is_dropped(self):
        # Says nothing, contradicts nothing: the folder decides, as for a legacy ZIP.
        validate_script(self.raw(self.PLAY), self.PLAY, expected_play="le-malade")

    def test_oversized_file_is_rejected(self):
        with self.assertRaises(UploadError):
            validate_script(b"x" * (MAX_SCRIPT_BYTES + 1), self.PLAY)

    def test_non_utf8_is_rejected(self):
        with self.assertRaises(UploadError):
            validate_script(b"\xff\xfe{}", self.PLAY)


class TestProcessZip(unittest.TestCase):
    """All-or-nothing per ZIP, so an actor never gets half their lines online.
    `transcode` is mocked: build.yml's CI has no ffmpeg."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.clips = Path(self.tmp.name) / "clips"
        self.clips.mkdir()
        self.zip_path = Path(self.tmp.name) / "voix-lea.zip"
        with zipfile.ZipFile(self.zip_path, "w") as zf:
            zf.writestr(
                "manifest.json",
                json.dumps(
                    {
                        "play": "le-malade",
                        "clips": {"aaaa-1111": "Silence !", "bbbb-2222": "J'arrive."},
                    }
                ),
            )
            zf.writestr("aaaa-1111.webm", b"x")
            zf.writestr("bbbb-2222.webm", b"x")

    def published(self):
        return sorted(p.name for p in self.clips.iterdir())

    def test_every_clip_is_published_when_all_convert(self):
        def fake_transcode(source, dest):
            dest.write_bytes(b"mp3")

        clips_index = {"vieux-id": "déjà là"}
        with mock.patch.object(process_uploads, "transcode", fake_transcode):
            self.assertEqual(process_uploads.process_zip(self.zip_path, clips_index, self.clips), 2)
        self.assertEqual(self.published(), ["aaaa-1111.mp3", "bbbb-2222.mp3"])
        # Raw text as of recording time; build_manifest normalizes.
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
        with mock.patch.object(process_uploads, "transcode", failing_transcode):
            with self.assertRaises(UploadError):
                process_uploads.process_zip(self.zip_path, clips_index, self.clips)
        # Not even the take converted before the failure.
        self.assertEqual(self.published(), [])
        self.assertEqual(clips_index, {"vieux-id": "déjà là"})

    def test_a_zip_naming_another_play_publishes_nothing(self):
        # mp3s are named by line id, so a misfiled merge shows only at rehearsal.
        # The refusal precedes any conversion, hence this `transcode`.
        def never(source, dest):
            raise AssertionError("no conversion must be attempted")

        with mock.patch.object(process_uploads, "transcode", never):
            with self.assertRaises(UploadError):
                process_uploads.process_zip(
                    self.zip_path, {}, self.clips, expected_play="transport-de-femmes"
                )
        self.assertEqual(self.published(), [])

    def test_a_zip_naming_its_own_play_is_merged(self):
        def fake_transcode(source, dest):
            dest.write_bytes(b"mp3")

        with mock.patch.object(process_uploads, "transcode", fake_transcode):
            self.assertEqual(
                process_uploads.process_zip(self.zip_path, {}, self.clips, expected_play="le-malade"),
                2,
            )

    def test_a_corrupted_archive_is_an_upload_error(self):
        broken = Path(self.tmp.name) / "abime.zip"
        broken.write_bytes(b"pas un zip du tout")
        with self.assertRaises(UploadError):
            process_uploads.process_zip(broken, {}, self.clips)


class TestMain(unittest.TestCase):
    """The script as the workflow calls it. The FOLDER routes and the content only
    verifies, so a damaged ZIP still reaches a journal. No valid ZIP here (no ffmpeg
    in CI), hence the mocked `shutil.which`."""

    PLAY = {
        "id": "le-malade",
        "title": "Pièce",
        # The malformed colour, dropped by sanitize_script, proves promotion writes
        # the uploaded bytes.
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
        self.plays = root / "plays"
        self.result = root / "uploads_result.json"
        self.addCleanup(self.tmp.cleanup)

    def zone(self, play_id):
        """An upload zone, as the play's upload button points to it."""
        folder = self.uploads / play_id
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def data(self, play_id):
        return self.plays / play_id / "data"

    def existing_play(self, play_id="le-malade", play=None):
        """A play already there, with its promoted script and its upload zone."""
        raw = json.dumps(play if play is not None else self.PLAY, ensure_ascii=False).encode("utf-8")
        self.data(play_id).mkdir(parents=True, exist_ok=True)
        (self.data(play_id) / "script.json").write_bytes(raw)
        self.zone(play_id)
        return raw

    def run_main(self):
        # Patched in common and in process_uploads, which imported it by value.
        with mock.patch.multiple(
            common, PLAYS_DIR=self.plays, UPLOADS_DIR=self.uploads
        ), mock.patch.multiple(
            process_uploads, UPLOADS_DIR=self.uploads, RESULT_PATH=self.result
        ), mock.patch.object(process_uploads.shutil, "which", return_value="/usr/bin/ffmpeg"):
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                process_uploads.main()
        return json.loads(self.result.read_text(encoding="utf-8"))

    def entries_of(self, results, play_id):
        return {entry["file"]: entry for entry in results["plays"].get(play_id, [])}

    def test_each_file_gets_its_own_kind_and_outcome(self):
        raw = self.existing_play()
        (self.zone("le-malade") / ".gitkeep").write_text("", encoding="utf-8")
        (self.zone("le-malade") / "script.json").write_bytes(raw)
        (self.zone("le-malade") / "voix-lea.zip").write_bytes(b"pas un zip du tout")
        (self.zone("le-malade") / "notes.txt").write_text("penser aux costumes", encoding="utf-8")

        results = self.entries_of(self.run_main(), "le-malade")

        self.assertEqual(set(results), {"script.json", "voix-lea.zip", "notes.txt"})
        # `changes` empty rather than absent: a MISSING key means a journal written
        # before the diff existed.
        self.assertEqual(
            results["script.json"], {"file": "script.json", "kind": "script", "changes": {}}
        )
        self.assertEqual((self.data("le-malade") / "script.json").read_bytes(), raw)
        self.assertEqual(results["voix-lea.zip"]["kind"], "voix")
        self.assertIn("ZIP", results["voix-lea.zip"]["error"])
        self.assertEqual(results["notes.txt"]["kind"], "inconnu")
        self.assertIn("inconnu", results["notes.txt"]["error"])

    def test_a_promoted_script_publishes_what_it_changed(self):
        # The diff crosses promote_script, record, update_history and build_manifest,
        # none of which look inside it.
        self.existing_play()
        updated = {
            **self.PLAY,
            "characters": self.PLAY["characters"] + [{"id": "c2", "name": "Annie"}],
            "acts": [
                {
                    "scenes": [
                        {
                            "lines": [
                                {"id": "l1", "characterId": "c1", "text": "Silence, enfin !"},  # edited
                                {"id": "l2", "characterId": "c2", "text": "J'arrive."},  # new
                            ]
                        }
                    ]
                }
            ],
        }
        (self.zone("le-malade") / "script.json").write_text(
            json.dumps(updated, ensure_ascii=False), encoding="utf-8"
        )

        results = self.entries_of(self.run_main(), "le-malade")

        self.assertEqual(
            results["script.json"]["changes"],
            {"linesAdded": 1, "linesEdited": 1, "castAdded": 1},
        )

    def test_a_script_that_creates_its_play_says_so_in_the_journal(self):
        # Nothing to compare against, so `created` plus the size of what arrived.
        new = {**self.PLAY, "id": "antigone"}
        (self.zone("antigone") / "script.json").write_text(
            json.dumps(new, ensure_ascii=False), encoding="utf-8"
        )

        results = self.entries_of(self.run_main(), "antigone")

        self.assertEqual(
            results["script.json"]["changes"],
            {"linesAdded": 1, "castAdded": 1, "created": True},
        )

    def test_the_drop_zone_is_emptied_except_hidden_files(self):
        self.existing_play()
        (self.zone("le-malade") / ".gitkeep").write_text("", encoding="utf-8")
        (self.zone("le-malade") / "voix-lea.zip").write_bytes(b"pas un zip du tout")
        (self.zone("le-malade") / "notes.txt").write_text("x", encoding="utf-8")
        self.run_main()
        # `.gitkeep` keeps the folder alive in git; it is not an upload.
        self.assertEqual([p.name for p in self.zone("le-malade").iterdir()], [".gitkeep"])

    def test_a_refused_script_leaves_the_play_untouched(self):
        before = self.existing_play()
        (self.zone("le-malade") / "export.json").write_text("[1, 2, 3]", encoding="utf-8")
        results = self.entries_of(self.run_main(), "le-malade")
        self.assertIn("error", results["export.json"])
        self.assertEqual((self.data("le-malade") / "script.json").read_bytes(), before)

    def test_an_empty_drop_zone_still_writes_a_result(self):
        # The workflow reads uploads_result.json unconditionally in the next step.
        self.assertEqual(self.run_main(), {"plays": {}, "unrouted": []})

    def test_two_plays_are_processed_independently(self):
        self.existing_play("le-malade")
        self.existing_play("transport", play={**self.PLAY, "id": "transport"})
        (self.zone("le-malade") / "voix-lea.zip").write_bytes(b"pas un zip du tout")
        (self.zone("transport") / "notes.txt").write_text("x", encoding="utf-8")

        results = self.run_main()

        self.assertEqual(set(results["plays"]), {"le-malade", "transport"})
        self.assertEqual(list(self.entries_of(results, "le-malade")), ["voix-lea.zip"])
        self.assertEqual(list(self.entries_of(results, "transport")), ["notes.txt"])
        self.assertEqual(results["unrouted"], [])

    def test_a_script_creates_its_play_and_its_deposit_zone(self):
        # `.gitkeep`: git versions no empty folder, and the zone must exist before
        # the coordinator clicks the play's button.
        new = {**self.PLAY, "id": "antigone"}
        (self.zone("antigone") / "script.json").write_text(
            json.dumps(new, ensure_ascii=False), encoding="utf-8"
        )

        results = self.run_main()

        self.assertEqual(list(self.entries_of(results, "antigone")), ["script.json"])
        self.assertNotIn("error", self.entries_of(results, "antigone")["script.json"])
        self.assertTrue((self.data("antigone") / "script.json").exists())
        self.assertTrue((self.plays / "antigone" / "clips" / ".gitkeep").exists())
        self.assertTrue((self.uploads / "antigone" / ".gitkeep").exists())

    def test_a_refused_script_in_an_orphan_zone_leaves_no_phantom_play(self):
        # Not even a `clips.json`, or the chooser shows a titleless play: hence the
        # `script_json.exists()` guard in `process_play_zone`.
        (self.zone("antigone") / "export.json").write_text("[1, 2, 3]", encoding="utf-8")
        results = self.run_main()
        self.assertFalse((self.plays / "antigone").exists())
        # No play journal to speak in, so the line goes to the root one.
        self.assertEqual([e["file"] for e in results["unrouted"]], ["export.json"])

    def new_play_zone(self):
        """The creation zone, as the management page's button points at it."""
        folder = self.uploads / process_uploads.NEW_PLAY_DIR
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def test_the_creation_gesture_of_the_site_creates_its_play(self):
        """The exact path of the management page's "New play" button. `validate_script`
        refuses a candidate with no line, and only its "against a play that HAS some"
        condition keeps this working."""
        (self.new_play_zone() / "l-ecole-des-femmes.txt").write_text(
            "L'École des femmes\n", encoding="utf-8"
        )

        results = self.entries_of(self.run_main(), "l-ecole-des-femmes")

        self.assertEqual(list(results), ["l-ecole-des-femmes.txt"])
        self.assertNotIn("error", results["l-ecole-des-femmes.txt"])
        # The ZONE files it as "script"; `kind_of` would have answered "inconnu".
        self.assertEqual(results["l-ecole-des-femmes.txt"]["kind"], "script")
        script = json.loads((self.data("l-ecole-des-femmes") / "script.json").read_text("utf-8"))
        self.assertEqual(script["id"], "l-ecole-des-femmes")
        self.assertEqual(script["title"], "L'École des femmes")
        self.assertEqual(script["language"], DEFAULT_LANGUAGE)
        self.assertTrue((self.plays / "l-ecole-des-femmes" / "clips" / ".gitkeep").exists())
        self.assertTrue((self.uploads / "l-ecole-des-femmes" / ".gitkeep").exists())
        # Left in the zone, it would be re-processed on every later run.
        self.assertEqual(list(self.new_play_zone().iterdir()), [])

    def test_the_creation_zone_reads_no_file_name(self):
        # The content, never the name, says which play is born.
        for name, title, play_id in (
            ("antigone (1).txt", "Antigone", "antigone"),
            ("antigone.txt", "Le Cid", "le-cid"),
            ("Phedre", "Phèdre", "phedre"),
            ("hamlet.md", "Ubu roi", "ubu-roi"),
        ):
            with self.subTest(name):
                (self.new_play_zone() / name).write_text(f"{title}\n", encoding="utf-8")
                results = self.entries_of(self.run_main(), play_id)
                self.assertEqual(list(results), [name])
                self.assertNotIn("error", results[name])
                self.assertTrue((self.data(play_id) / "script.json").exists())

    def test_a_title_that_leaves_no_address_is_reported_unrouted(self):
        # It names no play, so the reason goes to the root journal.
        (self.new_play_zone() / "piece.txt").write_text("???\n", encoding="utf-8")
        results = self.run_main()
        self.assertEqual(results["plays"], {})
        self.assertEqual(results["unrouted"][0]["kind"], "script")
        self.assertIn("adresse", results["unrouted"][0]["error"])
        self.assertFalse(self.plays.exists())

    def test_a_note_dropped_in_the_creation_zone_creates_no_play(self):
        # `read_title`'s strictness: several lines is a note, never a title.
        (self.new_play_zone() / "notes.txt").write_text(
            "penser aux costumes\net aux perruques\n", encoding="utf-8"
        )
        results = self.run_main()
        self.assertEqual(results["plays"], {})
        self.assertIn("lignes", results["unrouted"][0]["error"])
        self.assertFalse(self.plays.exists())

    def test_the_creation_zone_never_empties_a_play_that_already_exists(self):
        # `create_play`'s address gate refuses it before the promotion safeguard has to.
        before = self.existing_play("le-malade", play={**self.PLAY, "title": "Le Malade"})
        (self.new_play_zone() / "le-malade.txt").write_text("Le Malade\n", encoding="utf-8")
        results = self.run_main()
        # No play, so it speaks in the root journal: the page it was made from.
        self.assertEqual(results["plays"], {})
        self.assertIn("error", results["unrouted"][0])
        self.assertEqual(results["unrouted"][0]["file"], "le-malade.txt")
        self.assertEqual((self.data("le-malade") / "script.json").read_bytes(), before)

    def test_the_creation_zone_is_never_taken_for_a_play(self):
        # `_new-play` is not a valid play id, so it needs its own branch in `main`.
        (self.new_play_zone() / "antigone.txt").write_text("Antigone\n", encoding="utf-8")
        results = self.run_main()
        self.assertEqual(results["unrouted"], [])
        self.assertEqual(list(results["plays"]), ["antigone"])
        self.assertFalse((self.plays / process_uploads.NEW_PLAY_DIR).exists())

    def test_a_text_file_outside_the_creation_zone_creates_nothing(self):
        # The other half of "the folder decides": elsewhere a .txt is an unknown type.
        self.existing_play("le-malade")
        (self.zone("le-malade") / "titre.txt").write_text("Antigone\n", encoding="utf-8")
        (self.uploads / "titre.txt").write_text("Hamlet\n", encoding="utf-8")
        results = self.run_main()
        self.assertIn("inconnu", self.entries_of(results, "le-malade")["titre.txt"]["error"])
        self.assertIn("inconnu", results["unrouted"][0]["error"])
        self.assertFalse((self.plays / "antigone").exists())
        self.assertFalse((self.plays / "hamlet").exists())

    def test_voices_for_a_play_without_a_script_are_refused(self):
        (self.zone("antigone") / "voix-lea.zip").write_bytes(b"pas un zip du tout")
        results = self.run_main()
        self.assertIn("script", results["unrouted"][0]["error"])

    def test_a_script_naming_another_play_than_its_zone_is_refused(self):
        before = self.existing_play("le-malade")
        (self.zone("le-malade") / "script.json").write_text(
            json.dumps({**self.PLAY, "id": "transport"}, ensure_ascii=False), encoding="utf-8"
        )
        results = self.entries_of(self.run_main(), "le-malade")
        self.assertIn("transport", results["script.json"]["error"])
        self.assertEqual((self.data("le-malade") / "script.json").read_bytes(), before)

    def test_a_root_script_is_routed_by_its_own_id(self):
        # No folder to route with at the root, so the file's own identifier decides.
        new = {**self.PLAY, "id": "antigone"}
        (self.uploads / "script (1).json").write_text(
            json.dumps(new, ensure_ascii=False), encoding="utf-8"
        )
        results = self.run_main()
        self.assertEqual(list(self.entries_of(results, "antigone")), ["script (1).json"])
        self.assertTrue((self.data("antigone") / "script.json").exists())

    def test_a_root_script_without_an_id_is_reported_unrouted(self):
        (self.uploads / "script.json").write_text(
            json.dumps({k: v for k, v in self.PLAY.items() if k != "id"}), encoding="utf-8"
        )
        results = self.run_main()
        self.assertEqual(results["plays"], {})
        self.assertIn("pièce", results["unrouted"][0]["error"])

    def test_a_root_zip_is_reported_unrouted(self):
        # Voices always concern an existing play, which carries its own upload button.
        (self.uploads / "voix-lea.zip").write_bytes(b"peu importe")
        results = self.run_main()
        self.assertEqual(results["plays"], {})
        self.assertIn("zone de dépôt", results["unrouted"][0]["error"])

    def test_a_zone_whose_name_is_not_a_play_id_is_reported_unrouted(self):
        folder = self.uploads / "Le Malade"
        folder.mkdir(parents=True)
        (folder / "notes.txt").write_text("x", encoding="utf-8")
        results = self.run_main()
        self.assertEqual(results["plays"], {})
        self.assertIn("Le Malade", results["unrouted"][0]["error"])
        # Logged AND removed: leaving it would report it again on every run.
        self.assertEqual(list(folder.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
