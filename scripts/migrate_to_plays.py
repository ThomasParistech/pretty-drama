"""Move a repo's single play to `plays/<id>/`. To be run ONCE.

For a long time the repo knew only one play: `data/script.json` was the source of
truth and `clips/` carried its mp3s. Now that it hosts several, each play is a silo
(`plays/<id>/data/`, `plays/<id>/clips/`, `uploads/<id>/`), and this script is what
takes the old layout to the new one without losing anything.

It serves this repo as well as any troupe that already forked and has been working
for months: without it, pulling the new version would leave its play in a `data/`
nobody reads any more.

    python3 scripts/migrate_to_plays.py transport-de-femmes

The id is an ARGUMENT and is not derived from the title, which is what the
management page does when it creates a play. Two reasons: it names a folder and a
URL for years, so it deserves to be chosen by eye rather than endured; and
computing it here would require a second implementation of the slug, in Python,
that nothing would keep in agreement with the browser's one (`slugify`,
src/shared/data.js) for a script that runs only once.

Idempotent: run again, it notes that the play is already there and touches nothing.
It does not commit, it moves files; git recognizes the renames all by itself.
"""

from __future__ import annotations

import json
import shutil
import sys

from common import (
    REPO_ROOT,
    UPLOADS_DIR,
    is_play_id,
    play_clips_dir,
    play_data_dir,
    play_uploads_dir,
    write_json,
)

OLD_DATA = REPO_ROOT / "data"
OLD_CLIPS = REPO_ROOT / "clips"

# The four files that used to describe THE play. They go down as-is into its
# folder. What remains in `data/` after the move no longer speaks of any play in
# particular: the plays index and the journal of the uploads none of them claimed.
PLAY_FILES = ("script.json", "clips.json", "history.json", "manifest.json")


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if len(sys.argv) != 2:
        fail(
            "usage: python3 scripts/migrate_to_plays.py <id>\n"
            "The id names the play's folder and its address on the site "
            "(lowercase, digits and hyphens), for example transport-de-femmes."
        )
    play_id = sys.argv[1]
    if not is_play_id(play_id):
        fail(
            f"{play_id} is not a valid play id: lowercase, digits and hyphens, "
            "no leading hyphen, 64 characters at most."
        )

    target_script = play_data_dir(play_id) / "script.json"
    if target_script.exists():
        print(f"plays/{play_id}/ already carries a script: nothing to migrate.")
        return

    old_script = OLD_DATA / "script.json"
    if not old_script.exists():
        fail(
            "data/script.json cannot be found: there is no play to migrate. "
            "Create one from the site's plays management page."
        )

    # The script is read back here to set its id on it, and that is the ONLY
    # content edit of the whole migration. It is rewritten with the same formatting
    # as the editor's (indent 2), and all its fields are kept, character colours
    # included: we load, we add a key, we rewrite, without going through any
    # sanitize.
    try:
        script = json.loads(old_script.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(
            f"data/script.json is not valid JSON ({exc}): repair it or "
            "restore it from the GitHub history before migrating."
        )
    if not isinstance(script, dict):
        fail("data/script.json does not contain a play script: migration cancelled.")

    play_data_dir(play_id).mkdir(parents=True, exist_ok=True)

    # The CLIPS before the data files, and the order is not indifferent: the
    # idempotence guard, above, is the presence of the script at the destination.
    # With the mp3s moved last, an interruption between the two (Ctrl+C, full disk)
    # left a repo where the script was migrated but not the voices, and the rerun
    # stopped on the guard announcing "nothing to migrate", the mp3s being left
    # stranded. In this order, everything that precedes the script is already done
    # when the guard closes, and a rerun after an interruption picks up cleanly.
    if OLD_CLIPS.is_dir():
        # The whole folder, `.gitkeep` included: it keeps `clips/` alive in git when
        # the troupe has not recorded a single line yet.
        if play_clips_dir(play_id).exists():
            fail(
                f"plays/{play_id}/clips/ already exists while clips/ is still there: "
                "move the rest by hand, the migration will not choose for you."
            )
        shutil.move(str(OLD_CLIPS), str(play_clips_dir(play_id)))
        count = len(list(play_clips_dir(play_id).glob("*.mp3")))
        print(f"  clips/ -> plays/{play_id}/clips/ ({count} mp3)")

    for name in PLAY_FILES:
        source = OLD_DATA / name
        if source.exists():
            shutil.move(str(source), str(play_data_dir(play_id) / name))
            print(f"  data/{name} -> plays/{play_id}/data/{name}")

    script["id"] = play_id
    write_json(play_data_dir(play_id) / "script.json", script)
    print(f"  id {play_id} written into the script")

    # The PDF is derived and gitignored: it rebuilds itself at its new place on the
    # next deployment, there is nothing to move.
    (OLD_DATA / "script.pdf").unlink(missing_ok=True)

    # The play's upload zone. It must exist BEFORE the coordinator needs it: it is
    # what the Progress page's upload button points at, and GitHub only serves its
    # upload page on a folder it knows about.
    play_uploads_dir(play_id).mkdir(parents=True, exist_ok=True)
    (play_uploads_dir(play_id) / ".gitkeep").touch()
    (UPLOADS_DIR / ".gitkeep").touch()
    print(f"  uploads/{play_id}/ created")

    print(
        "\nMigration done. Rebuild the derived files:\n"
        "  python3 scripts/build_manifest.py && python3 scripts/build_plays_index.py"
    )


if __name__ == "__main__":
    main()
