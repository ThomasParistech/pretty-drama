"""Upload tests: the ZIP contract (`{play, clips: {lineId: raw text}}` + one audio
member `{id}.{ext}` per line), the ROUTING of uploaded files (one upload zone per
play, `uploads/<id>/`, plus the root as the creation channel), and the validation of
a script BEFORE it becomes the source of truth. A hostile input raises UploadError,
never anything else."""

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
        # The ZIP from before multiple plays: the manifest IS the mapping. An
        # actor may have had theirs sitting in their downloads for weeks, and
        # refusing it would protect nothing (it names no play, so it cannot
        # contradict one).
        archive = make_archive(
            {"aaaa-1111.webm": b"x"}, manifest={"aaaa-1111": "Silence !"}
        )
        self.assertEqual(
            parse_manifest(archive), ("", [("aaaa-1111", "aaaa-1111.webm", "Silence !")])
        )

    def test_an_empty_play_id_declares_nothing(self):
        # What the Recording page writes for a play whose script has no
        # identifier yet: accepted, and without any check.
        archive = make_archive(
            {"aaaa-1111.webm": b"x"}, manifest={"play": "", "clips": {"aaaa-1111": "t"}}
        )
        self.assertEqual(parse_manifest(archive)[0], "")

    def test_an_invalid_play_id_is_rejected(self):
        # This identifier becomes a path (`plays/<id>/`): it is validated the way
        # a line id is, and for the same reason.
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
        # The browser's SAFE_ID (mirror of LINE_ID_PATTERN) refuses "abc\n"; on
        # the Python side, `$` would accept it with .match, hence the fullmatch.
        # An id let through here would name an mp3 with a line break in it.
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
        self.assertEqual(parse_manifest(archive), ("", [("aaaa-1111", "aaaa-1111.webm", "texte")]))

    def test_too_many_clips_is_rejected(self):
        manifest = {f"id-{i}": "t" for i in range(MAX_CLIPS_PER_ZIP + 1)}
        archive = make_archive({}, manifest=manifest)
        with self.assertRaises(UploadError):
            parse_manifest(archive)


class TestShort(unittest.TestCase):
    """The only path from UNTRUSTED text to the coordinator's screen: a file name chosen
    by the ZIP, an excerpt of a manifest, ffmpeg output. Everything `short` promises
    is consumed by a table cell (the upload journal on the Dashboard), so both
    properties matter just as much as one another: a single line, and a bounded
    length."""

    def test_whitespace_is_flattened_to_single_spaces(self):
        # A line break would break the table row, and a LaTeX or ffmpeg log is
        # full of them.
        self.assertEqual(short("voix\nde\t serge  .zip", 100), "voix de serge .zip")

    def test_a_long_text_is_capped_and_says_so(self):
        self.assertEqual(short("a" * 12, 10), "a" * 10 + "…")

    def test_a_text_at_the_cap_is_left_alone(self):
        # No ellipsis for nothing: the limit is inclusive.
        self.assertEqual(short("a" * 10, 10), "a" * 10)

    def test_a_non_string_is_accepted(self):
        # Callers pass the EXCEPTION itself (`short(exc, ...)`), not its message:
        # without the `str()`, the coordinator's only feedback channel would raise at
        # the very moment of reporting the failure.
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
    """An upload's type comes from the extension ALONE: the browser happily
    renames files to "script (1).json" or "voix-serge (2).zip"."""

    def test_extensions_decide(self):
        self.assertEqual(kind_of(Path("voix-serge.zip")), "voix")
        self.assertEqual(kind_of(Path("voix-serge (2).ZIP")), "voix")
        self.assertEqual(kind_of(Path("script.json")), "script")
        self.assertEqual(kind_of(Path("script (1).json")), "script")
        self.assertEqual(kind_of(Path("notes.txt")), "inconnu")
        self.assertEqual(kind_of(Path("voix-serge")), "inconnu")


class TestValidateScript(unittest.TestCase):
    """Safeguard BEFORE overwriting a play's script.json: stricter than
    sanitize_script, which is only a tolerant reader."""

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
        # The real danger: a foreign JSON would sanitize into an empty play.
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
        # The file names its play, and so does the upload folder: letting the two
        # contradict each other would overwrite one play's script with another's.
        other = {**self.PLAY, "id": "le-malade"}
        with self.assertRaises(UploadError):
            validate_script(self.raw(other), self.PLAY, expected_play="transport-de-femmes")

    def test_a_script_naming_its_own_play_passes(self):
        same = {**self.PLAY, "id": "le-malade"}
        validate_script(self.raw(same), self.PLAY, expected_play="le-malade")

    def test_a_script_without_an_id_is_accepted_where_it_is_dropped(self):
        # A script downloaded before this field existed: it says nothing, so it
        # contradicts nothing, and the folder decides (same tolerance as for a ZIP
        # in the older form).
        validate_script(self.raw(self.PLAY), self.PLAY, expected_play="le-malade")

    def test_oversized_file_is_rejected(self):
        with self.assertRaises(UploadError):
            validate_script(b"x" * (MAX_SCRIPT_BYTES + 1), self.PLAY)

    def test_non_utf8_is_rejected(self):
        with self.assertRaises(UploadError):
            validate_script(b"\xff\xfe{}", self.PLAY)


class TestProcessZip(unittest.TestCase):
    """The merge is ALL-OR-NOTHING per ZIP: a take that refuses to convert must
    leave behind neither a published mp3 nor a clips.json entry for the takes
    that came before it in the same ZIP. That is what guarantees an actor never
    ends up with half of their lines online.

    ffmpeg is not installed in build.yml's CI: `transcode` is therefore replaced,
    which tests exactly the part we care about (the order of the two phases),
    without depending on the converter."""

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
        # RAW text as of recording time (normalization only happens in
        # build_manifest), and the clips already there are kept.
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
        # Neither the take converted before the failure nor the next one: nothing
        # is published, and the index has not moved.
        self.assertEqual(self.published(), [])
        self.assertEqual(clips_index, {"vieux-id": "déjà là"})

    def test_a_zip_naming_another_play_publishes_nothing(self):
        # The mp3s are named by LINE id: merging here would write one play's
        # voices under another play's lines, and nobody would notice before the
        # rehearsal. The refusal comes before any conversion, hence the
        # `transcode` that would raise if it were called.
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
    """The script as the workflow calls it, on real upload zones.

    This is where ROUTING happens, and routing is the heart of the multi-play repo:
    it is the FOLDER that decides which play a file belongs to, never its content,
    without which a damaged ZIP (hence unreadable, hence silent about its play)
    would have no journal to speak in. The identifier the file carries only serves
    to check.

    No valid ZIP here: transcoding them would need ffmpeg, which the CI installs
    only in uploads.yml when there are voices to process. An unreadable ZIP fails
    before any call to ffmpeg, so `shutil.which` is the only point to neutralise
    (without it, the "ffmpeg not found" guard would exit with an error)."""

    PLAY = {
        "id": "le-malade",
        "title": "Pièce",
        # The malformed colour is what sanitize_script drops (it only copies the
        # `#rrggbb` form): it proves that promotion really writes the uploaded
        # bytes, and not a re-read version.
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
        # `PLAYS_DIR` and `UPLOADS_DIR` are patched in common, where the path
        # helpers re-read them on every call; `UPLOADS_DIR` is also patched in
        # process_uploads, which imported it by value.
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
        # The script is promoted, verbatim (the malformed colour survived).
        self.assertEqual(results["script.json"], {"file": "script.json", "kind": "script"})
        self.assertEqual((self.data("le-malade") / "script.json").read_bytes(), raw)
        # Every file carries ITS own failure, with its own reason.
        self.assertEqual(results["voix-lea.zip"]["kind"], "voix")
        self.assertIn("ZIP", results["voix-lea.zip"]["error"])
        self.assertEqual(results["notes.txt"]["kind"], "inconnu")
        self.assertIn("inconnu", results["notes.txt"]["error"])

    def test_the_drop_zone_is_emptied_except_hidden_files(self):
        self.existing_play()
        (self.zone("le-malade") / ".gitkeep").write_text("", encoding="utf-8")
        (self.zone("le-malade") / "voix-lea.zip").write_bytes(b"pas un zip du tout")
        (self.zone("le-malade") / "notes.txt").write_text("x", encoding="utf-8")
        self.run_main()
        # `.gitkeep` keeps the folder alive in git: it is not an upload.
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
        # Siloing, seen from the repo: two zones, two journals, and one's failure
        # says nothing in the other.
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
        # A play is born from a script upload into a zone that does not correspond
        # to any play yet. Both `.gitkeep` files matter: git does not version an
        # empty folder, and the upload zone must exist before the coordinator clicks the
        # upload button of their new play.
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

    def test_the_empty_play_the_site_offers_creates_itself(self):
        """The EXACT path of the management page's "New play" gesture: the
        downloaded play is empty (`newPlayScript`, src/shared/plays.js), and
        `validate_script`'s safeguard is precisely the one that refuses a candidate
        without any line. It only applies against a play that has some, but nothing
        in the signature says so: without this test, the only way to create a play
        from the site could become a refusal the first time the safeguard is
        tightened."""
        fresh = {
            "id": "antigone",
            "title": "Antigone",
            "language": "fr",
            "characters": [],
            "acts": [{"scenes": [{"lines": []}]}],
        }
        (self.zone("antigone") / "antigone.json").write_text(
            json.dumps(fresh, ensure_ascii=False), encoding="utf-8"
        )
        results = self.entries_of(self.run_main(), "antigone")
        self.assertNotIn("error", results["antigone.json"])
        self.assertTrue((self.data("antigone") / "script.json").exists())

    def test_a_failed_creation_leaves_no_phantom_play(self):
        # A play folder created by a refused upload would make a phantom play show
        # up in the cast's chooser, with no title and no line.
        (self.zone("antigone") / "export.json").write_text("[1, 2, 3]", encoding="utf-8")
        results = self.run_main()
        self.assertFalse((self.plays / "antigone").exists())
        # The entry exists all the same: it has no play journal to go to, so it
        # goes to the root one, which the management page displays.
        self.assertEqual([e["file"] for e in results["unrouted"]], ["export.json"])

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
        # The safety net: at the root there is no folder to route with, so the
        # file's own identifier decides. It covers the case where GitHub would
        # refuse to serve its upload page for a folder it does not know yet.
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
        # Voices always concern a play that exists, and that play carries its own
        # upload button: the root has no reason to accept any.
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
        # Logged AND removed, like any faulty upload: leaving it would have it
        # reported again on every run.
        self.assertEqual(list(folder.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
