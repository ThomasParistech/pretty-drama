"""Move a fork's single old-layout play to `plays/<id>/`. To be run ONCE.

    python3 scripts/migrate_to_plays.py transport-de-femmes

The id is an ARGUMENT, not derived from the title: it names a folder and a URL for
years, so it is chosen by eye. Idempotent, and it commits nothing; git sees the renames.
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

# The four files that used to describe THE play.
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

    # The ONLY content edit: load, add a key, rewrite, never through a sanitize.
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

    # CLIPS first: the idempotence guard is the script at the destination, so anything
    # moved after it would be stranded by an interruption.
    if OLD_CLIPS.is_dir():
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

    # Derived: it is typeset again at its new place, nothing to move.
    (OLD_DATA / "script.pdf").unlink(missing_ok=True)

    # GitHub only serves its upload page on a folder it already knows about.
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
