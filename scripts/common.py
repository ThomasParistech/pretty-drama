"""Shared by every Action script: a play's identity, repo paths, JSON, timestamps.

The identity half is the Python side of src/shared/plays.js: the browser announces, the
Action decides, scripts/tests/ holds the two in agreement."""

# Keeps annotations unevaluated so an older local Python can still import this.
from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Mirror of SAFE_PLAY_ID (src/shared/plays.js), compared character for character by
# test_contracts.py. This id names a folder and a URL segment.
PLAY_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def is_play_id(value) -> bool:
    # fullmatch, not match: Python's `$` also accepts a trailing newline, SAFE_PLAY_ID
    # does not, and this value becomes a path.
    return isinstance(value, str) and PLAY_ID_PATTERN.fullmatch(value) is not None


# The site's test bench: ordinary except that build_plays_index leaves it out of
# data/plays.json. Mirror of DEV_PLAY_ID (src/shared/plays.js).
DEV_PLAY_ID = "dev"

# Bound of the pattern above: mint_play_id must truncate to the same length.
MAX_PLAY_ID_LENGTH = 64


def mint_play_id(title) -> str:
    """A play's id, derived from its title: "L'École des femmes" -> "l-ecole-des-femmes".

    The Action decides here; `mintPlayId` (src/shared/plays.js) only announces, and
    scripts/tests/play-id-cases.json holds the two in agreement. Empty string when the
    title leaves no usable address; the caller then refuses."""
    if not isinstance(title, str):
        return ""
    # Lowercase BEFORE decomposing so "É" folds onto "e" instead of being dropped.
    folded = unicodedata.normalize("NFD", title.lower())
    base = "".join(c for c in folded if not unicodedata.combining(c))
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    # Truncation can land on a hyphen, which the pattern refuses at the end too.
    return base[:MAX_PLAY_ID_LENGTH].rstrip("-")


def new_play_script(play_id: str, title: str, language: str) -> dict:
    """The empty play a creation upload brings into being. Mirror of EMPTY_SCRIPT
    (src/editor/reducer.js), held by test_contracts.py. The empty act and scene are the
    structural floor: there must be a scene to write a line in."""
    return {
        "id": play_id,
        "title": title,
        "language": language,
        "characters": [],
        "acts": [{"scenes": [{"lines": []}]}],
    }


PLAYS_DIR = REPO_ROOT / "plays"
UPLOADS_DIR = REPO_ROOT / "uploads"


def play_dir(play_id: str) -> Path:
    # Callers validate with is_play_id BEFORE building a path.
    return PLAYS_DIR / play_id


def play_data_dir(play_id: str) -> Path:
    return play_dir(play_id) / "data"


def play_clips_dir(play_id: str) -> Path:
    return play_dir(play_id) / "clips"


def play_uploads_dir(play_id: str) -> Path:
    return UPLOADS_DIR / play_id


def play_ids() -> list[str]:
    """The repo's plays, by ascending id, from the FOLDERS and not an index, so an
    unreadable script never removes a play from the site. A folder whose name is not a
    valid id is ignored: no upload can name it."""
    if not PLAYS_DIR.is_dir():
        return []
    return sorted(p.name for p in PLAYS_DIR.iterdir() if p.is_dir() and is_play_id(p.name))


def load_json(path: Path, default, warning: str | None = None):
    """Tolerant read of a DERIVED file: missing or damaged returns the fallback.

    Never for script.json, whose caller must tell "missing" from "unreadable": writing
    over an unreadable file would erase a troupe's play. `warning` goes to stderr only
    when the file exists but will not parse."""
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        if warning:
            print(warning, file=sys.stderr)
        return default


def utc_stamp() -> str:
    """ISO timestamp to the second, Z suffix: the project's one format, read as-is by
    `new Date()` in the browser."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, data, sort_keys: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=sort_keys) + "\n",
        encoding="utf-8",
    )
