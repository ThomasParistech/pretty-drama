"""What promoting a script DOES to a play, counted for the upload journal.

Diffed BY LINE ID: ids are never recycled, so a line that keeps its id and changes its
text is edited, not removed plus added. Pure, and separate from process_uploads.py so
it can be tested without a temporary directory.
"""

from __future__ import annotations

from build_manifest import sanitize_script
from normalize import normalize_text


def _lines_by_id(script: dict) -> dict[str, tuple]:
    """{line id: (character id, raw text)}, acts and scenes flattened because moving a
    line between scenes changes nobody's work; the move still surfaces through `other`.
    A duplicate id (hand edit only) collapses and is undercounted, which is accepted."""
    return {
        line["id"]: (line["characterId"], line["text"])
        for act in script["acts"]
        for scene in act["scenes"]
        for line in scene["lines"]
    }


def _cast_by_id(script: dict) -> dict[str, str]:
    return {c["id"]: c["name"] for c in script["characters"]}


# What a brand new play reports about itself: its SIZE, and nothing else.
_ON_ARRIVAL = ("linesAdded", "castAdded")


def script_changes(old: dict, new: dict, created: bool = False) -> dict:
    """What the promotion changed, counts and flags, EMPTY VALUES OMITTED.

    `created` says there was no script at this address, which only the caller knows. An
    empty result renders as "aucun changement", so it must never be a lie: `other`
    compares the two sanitized documents whole and fires when nothing else did. EDITED
    is measured on NORMALIZED text, the same rule as compute_status's "perime", because
    the count is read as "these have to be recorded again".
    """
    was, now = sanitize_script(old), sanitize_script(new)
    before, after = _lines_by_id(was), _lines_by_id(now)
    old_cast, new_cast = _cast_by_id(was), _cast_by_id(now)
    kept_lines = before.keys() & after.keys()
    kept_cast = old_cast.keys() & new_cast.keys()
    changes = {
        "linesAdded": len(after.keys() - before.keys()),
        "linesRemoved": len(before.keys() - after.keys()),
        "linesEdited": sum(
            1
            for i in kept_lines
            if normalize_text(before[i][1]) != normalize_text(after[i][1])
        ),
        # A line that changed HANDS: the clip is keyed by line id, so it stays attached
        # and the grid keeps showing it green in the previous actor's voice.
        "linesReassigned": sum(1 for i in kept_lines if before[i][0] != after[i][0]),
        "castAdded": len(new_cast.keys() - old_cast.keys()),
        "castRemoved": len(old_cast.keys() - new_cast.keys()),
        # Raw and not normalized: "Serge" -> "serge" is a rename the troupe will see.
        "castRenamed": sum(1 for i in kept_cast if old_cast[i] != new_cast[i]),
        "title": was["title"] != now["title"],
        "language": was["language"] != now["language"],
    }
    changes = {field: value for field, value in changes.items() if value}
    if created:
        # A birth has nothing to compare against: title and language are initial STATE,
        # not changes, and `other` is meaningless. Only the size is worth reporting.
        return {"created": True, **{f: v for f, v in changes.items() if f in _ON_ARRIVAL}}
    if not changes and was != now:
        changes["other"] = True
    return changes
