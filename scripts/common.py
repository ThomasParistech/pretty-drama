"""Bits shared by every Action script: repo paths, JSON writing, timestamps."""

# This import keeps the annotations in this module (`list[str]`, `str | None`) from
# being evaluated: the workflow runs on Python 3.12, but a dev may have an older
# version at hand, where those forms would raise on import. The other modules in
# scripts/ already do the same, for the same reason.
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Mirror of SAFE_PLAY_ID in src/shared/plays.js, to keep in sync: a guard in
# scripts/tests/test_contracts.py compares the two expressions character for
# character, as it does for line ids.
#
# This id names a FOLDER in the repo (`plays/<id>/`, `uploads/<id>/`) and a URL
# segment of the published site, so it is validated on both sides: the browser mints
# it, the Action revalidates it before turning it into a path.
PLAY_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def is_play_id(value) -> bool:
    """`fullmatch` and not `match`: in Python, `$` also accepts a trailing newline
    ("my-play\\n" would pass), where the browser's SAFE_PLAY_ID rejects it. Same
    precaution as LINE_ID_PATTERN, and for the same reason: this value becomes a
    path."""
    return isinstance(value, str) and PLAY_ID_PATTERN.fullmatch(value) is not None


# A play's layout, in one place. Each play is a SILO: its pages, data, clips and
# upload zone live under its id, and nothing concerning it is stored anywhere else.
# That is what makes adding or removing a play touch no other one, and what lets a
# play's pages read `data/manifest.json` as a RELATIVE path, exactly as back when the
# site knew only one play.
PLAYS_DIR = REPO_ROOT / "plays"
UPLOADS_DIR = REPO_ROOT / "uploads"


def play_dir(play_id: str) -> Path:
    """A play's folder. `is_play_id` is what makes this concatenation safe: the
    pattern accepts neither a dot nor a slash, so no valid id can escape `plays/`.
    Every caller therefore validates BEFORE building a path, never after."""
    return PLAYS_DIR / play_id


def play_data_dir(play_id: str) -> Path:
    return play_dir(play_id) / "data"


def play_clips_dir(play_id: str) -> Path:
    return play_dir(play_id) / "clips"


def play_uploads_dir(play_id: str) -> Path:
    return UPLOADS_DIR / play_id


def play_ids() -> list[str]:
    """The repo's plays, by ascending id.

    The list comes from the FOLDERS and not from an index: that is what guarantees a
    play never disappears from the site because its script became unreadable. A
    folder whose name is not a valid id is ignored, which is not mere caution: it was
    created by hand, no uploaded file will be able to name it, and publishing it
    would give a URL the site could not write.
    """
    if not PLAYS_DIR.is_dir():
        return []
    return sorted(p.name for p in PLAYS_DIR.iterdir() if p.is_dir() and is_play_id(p.name))


def load_json(path: Path, default, warning: str | None = None):
    """Shared tolerant read: a missing or damaged file returns the fallback.

    It used to live in update_history.py, where the journal is only a convenience. It
    now serves everything that reads a DERIVED file sitting next to a source of truth
    (journal, plays index, clip state), and the rule is the same everywhere: a
    damaged derived file is read in degraded mode, it does not fail the run, and
    above all not the run of the other plays. The one read that does not go through
    here is `script.json`, whose caller must tell "missing" from "unreadable":
    writing over an unreadable file would erase a troupe's play.

    `warning` is written to stderr when the file EXISTS but will not parse. A missing
    file is a normal case (a play with no upload yet); a damaged one deserves a line
    in the CI log. With no message, the read is silent.
    """
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        if warning:
            print(warning, file=sys.stderr)
        return default


def utc_stamp() -> str:
    """ISO timestamp to the second, suffixed with Z. One timestamp format in the
    whole project: `new Date()` reads it as-is on the browser side."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, data, sort_keys: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=sort_keys) + "\n",
        encoding="utf-8",
    )
