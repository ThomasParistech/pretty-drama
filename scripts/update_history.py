"""Logs this run's uploads into the journals: one per play, plus the root one.

The journal is the project's only error channel; the root one takes what no play claims.
Input is uploads_result.json, so only uploads.yml ever writes here. A failed run commits
nothing, so nothing is logged: the last entry's date stops moving.
"""

from __future__ import annotations

import sys
from pathlib import Path

from common import REPO_ROOT, is_play_id, load_json, play_data_dir, utc_stamp, write_json

ROOT_HISTORY_PATH = REPO_ROOT / "data" / "history.json"
RESULT_PATH = REPO_ROOT / "uploads_result.json"

# Capped: the journal is committed on every upload and would otherwise grow forever.
MAX_RUNS = 30


def add_run(history: dict, files: list, at: str) -> dict:
    """Journal plus this upload's result gives a new journal (pure). Newest first,
    which is the display order, so the cap reads as "keep the last MAX_RUNS"."""
    runs = history.get("runs")
    if not isinstance(runs, list):
        runs = []
    return {"runs": [{"at": at, "files": files}] + runs[: MAX_RUNS - 1]}


def append(path: Path, files: list, at: str) -> None:
    history = load_json(path, {})
    if not isinstance(history, dict):
        history = {}
    write_json(path, add_run(history, files, at))


def main() -> None:
    result = load_json(RESULT_PATH, {})
    if not isinstance(result, dict):
        result = {}
    by_play = result.get("plays")
    by_play = by_play if isinstance(by_play, dict) else {}
    unrouted = result.get("unrouted")
    unrouted = unrouted if isinstance(unrouted, list) else []

    # One timestamp for the whole run: files uploaded together are a single upload.
    at = utc_stamp()
    written = 0
    for play_id, files in sorted(by_play.items()):
        if not isinstance(files, list) or not files:
            continue
        # Validated before building a path, however trusted the caller.
        if not is_play_id(play_id):
            print(f"Journal: invalid play id, ignored ({play_id!r})", file=sys.stderr)
            continue
        append(play_data_dir(play_id) / "history.json", files, at)
        written += 1
        print(f"Journal for {play_id!r}: 1 entry added ({len(files)} file(s))")

    if unrouted:
        append(ROOT_HISTORY_PATH, unrouted, at)
        written += 1
        print(f"Root journal: 1 entry added ({len(unrouted)} unroutable file(s))")

    if written == 0:
        print("Journal: nothing to log (no file uploaded)")


if __name__ == "__main__":
    main()
