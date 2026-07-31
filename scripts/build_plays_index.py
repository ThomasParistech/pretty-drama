"""Writes data/plays.json, the list of plays and the ONLY file sitting above them.

Each play is a silo: its pages, data and clips live under `plays/<id>/` and need
nothing else. But something has to say WHICH plays exist, or the two root pages (the
troupe's chooser and the coordinator's management page) would have nothing to list. This is
that file, and it holds nothing beyond what is needed to draw a play card: its id, its
title, its language, and enough to show where it stands.

Derived end to end, like the manifest: it is rebuilt on every upload and every
deployment, and carries no information that is not already inside a play.

Two things not to undo.

1. **The list comes from the FOLDERS** (`play_ids`) and not from the manifests: a play
   whose manifest is missing or damaged still shows up, with whatever could be read of
   it. A play VANISHING from the chooser is the worst possible display, since the
   coordinator then has no path left to its upload page to repair it.

2. **The order is by id, not by title.** Sorting on the title would mean comparing
   accented strings, so choosing a locale, and a machine file has no business knowing
   one (same rule as the manifest's ranks, which leave the front to write "Acte II").
   The two root pages are what sort for display, with `Intl.Collator` and in the
   reader's language.
"""

from __future__ import annotations

from common import REPO_ROOT, load_json, play_data_dir, play_ids, write_json

INDEX_PATH = REPO_ROOT / "data" / "plays.json"


def play_entry(play_id: str) -> dict:
    """What a play card needs to know, read in degraded mode.

    The manifest is the only file consulted for the title: it is already what every
    page reads, and it is rebuilt just before us by both workflows. Missing (a play
    born from a rejected upload) or damaged, the card falls back to an empty title,
    which the two root pages render with the same "Pièce sans titre" as the five
    headers.
    """
    data = play_data_dir(play_id)
    manifest = load_json(data / "manifest.json", {})
    if not isinstance(manifest, dict):
        manifest = {}
    lines = manifest.get("lines")
    lines = lines if isinstance(lines, list) else []

    history = load_json(data / "history.json", {})
    runs = history.get("runs") if isinstance(history, dict) else None
    runs = runs if isinstance(runs, list) else []
    # The most recent upload's date, the journal being ordered newest to oldest (see
    # update_history.add_run). It acts as a sign of life on the card, the same role it
    # already plays at the top of the Dashboard journal: a play whose date stops
    # advancing is a play whose uploads are failing.
    last = runs[0].get("at") if runs and isinstance(runs[0], dict) else None

    return {
        "id": play_id,
        # The title comes from the manifest, so from the script, so from the troupe:
        # it is data and never interface text. The fallback is left to the front.
        "title": manifest.get("title") if isinstance(manifest.get("title"), str) else "",
        "language": manifest.get("language") if isinstance(manifest.get("language"), str) else "fr",
        # Two numbers rather than an already-composed percentage: `fmt.percent` is
        # what puts a share into words, in the reader's language.
        "lines": len(lines),
        "recorded": sum(1 for line in lines if isinstance(line, dict) and line.get("status") == "ok"),
        "lastDeposit": last if isinstance(last, str) else None,
    }


def main() -> None:
    plays = [play_entry(play_id) for play_id in play_ids()]
    write_json(INDEX_PATH, {"plays": plays})
    print(f"data/plays.json: {len(plays)} play(s)")


if __name__ == "__main__":
    main()
