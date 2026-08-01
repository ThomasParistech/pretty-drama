"""What promoting a script DOES to a play, counted for the upload journal.

A promoted script used to publish nothing but its file name, so its row in the
Progress page's journal was the one row of that table with an empty detail column, on
the very upload the coordinator has the least intuition about: a voice ZIP announces
itself (they received it, they know whose it is), whereas `script.json` is a file they
downloaded from the Editing page minutes ago and cannot tell apart from the previous
one. "Did my act III really go through?" had no answer anywhere on the site.

So the promotion is DIFFED, by line id, and this is the module that does it. Line ids
are never recycled (they name the mp3s), which is what makes the three counts mean
what they say: a line that keeps its id and changes its text was EDITED, it was not
one line removed and another added.

Pure, and separate from process_uploads.py on purpose: it is a comparison of two
documents with no file system and no upload zone in sight, and it is the one part of
the promotion worth reading in a test rather than through a temporary directory.
"""

from __future__ import annotations

from build_manifest import sanitize_script
from normalize import normalize_text


def _lines_by_id(script: dict) -> dict[str, tuple]:
    """{line id: (character id, raw text)} over the whole play, acts and scenes flattened.

    Flattened, because MOVING a line between two scenes changes nobody's work: the
    counts are read as "who has to record what", and a line that changed scene keeps
    its text and its recording. That move is not lost, though: it lands in `other`
    below, so the row never claims nothing happened.

    Keyed by id, so a script carrying the SAME id twice (a hand edit in the
    repository: the editor re-mints a duplicate, `sanitize_script` on this side
    deliberately does not) collapses to one line here and is undercounted. Accepted:
    duplicate ids are outside the project's contract, and the alternative is a diff
    that no longer pairs lines at all.
    """
    return {
        line["id"]: (line["characterId"], line["text"])
        for act in script["acts"]
        for scene in act["scenes"]
        for line in scene["lines"]
    }


def _cast_by_id(script: dict) -> dict[str, str]:
    return {c["id"]: c["name"] for c in script["characters"]}


# What a brand new play reports about itself: its SIZE, and nothing else. See the
# `created` branch of `script_changes`.
_ON_ARRIVAL = ("linesAdded", "castAdded")


def script_changes(old: dict, new: dict, created: bool = False) -> dict:
    """What the promotion changed, counts and flags, EMPTY VALUES OMITTED.

    `created` says there was no script at this address, which is a different question
    from "is `old` empty": a play can exist and carry no title. The caller knows, this
    function cannot.

    Both sides go through `sanitize_script`, the lenient reader: `old` is a file that
    may have been hand-edited in the repository and `new` one that just crossed the
    internet, and a journal line must never be the thing that sinks the run.

    An entry is left out when it is zero or false, so the dict committed into
    history.json reads by eye ("linesAdded: 12") instead of carrying a wall of zeros,
    and the front treats a missing field as nothing to say.

    ---- The empty dict is a PROMISE, and it is why `other` exists ----
    An empty result renders as "aucun changement", so it must never be a lie. The first
    version of this function counted lines and cast ids and nothing else, which meant a
    renamed character, a retitled play, a language switch, a recoloured role, an added
    scene and a line moved between two scenes ALL came out as "no change". That is the
    worst answer the journal can give: the coordinator concludes the upload failed and
    uploads again.
    So everything worth naming is named, and `other` closes the set by comparing the two
    sanitized documents WHOLE. If they differ and nothing above fired, something changed
    that this function does not have a word for, and the row says so instead of denying
    it. `other` is a floor and not an audit: it only speaks when it is the only thing
    left to say, so an unnamed retouch riding along with twelve added lines goes
    unmentioned, which is the right silence.
    Two sanitized documents that are EQUAL while the raw bytes differ (key order, a
    stale `title` on an act that sanitize drops) really is "no change": nothing the site
    reads moved.

    EDITED is measured on NORMALIZED text, the same rule as `compute_status`'s
    "perime", and this is the second and only other caller of `normalize.py`. It has
    to be that rule: the number is read as "these actors have to record again", and a
    line whose text changed by a curly apostrophe alone does not invalidate anything.
    Comparing raw text here would send the coordinator chasing an actor over a
    typographic fix, while the grid beside the journal kept showing the line green.
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
        # A line that kept its id and its text and changed HANDS, which is the one
        # change of the lot that the site cannot see anywhere else: the clip is keyed by
        # line id, so it stays attached and the Progress grid keeps showing the line
        # green, in the previous actor's voice. Nothing but this count says it.
        "linesReassigned": sum(1 for i in kept_lines if before[i][0] != after[i][0]),
        # The cast, because taking a part away or handing one out is a change to the
        # troupe that no line count reveals: twelve lines given to a new role read as
        # "+12" and nothing else.
        "castAdded": len(new_cast.keys() - old_cast.keys()),
        "castRemoved": len(old_cast.keys() - new_cast.keys()),
        # Raw comparison, not normalized: a name is a name, and "Serge" becoming
        # "serge" is a rename the troupe will read on the grid.
        "castRenamed": sum(1 for i in kept_cast if old_cast[i] != new_cast[i]),
        # The two document-level fields, flags and not counts: there is one of each, so
        # a number would say nothing a boolean does not.
        "title": was["title"] != now["title"],
        "language": was["language"] != now["language"],
    }
    changes = {field: value for field, value in changes.items() if value}
    if created:
        # A birth has nothing to compare itself against. The title and the language of a
        # brand new play are its initial STATE, not a change to it ("titre modifié" on
        # the upload that gave the play its title reads as a correction that never
        # happened), and `other` means nothing when every part of the document is new.
        # What is worth saying is how big it arrived, which is what tells a play born
        # from a title (nothing to count, so `created` alone) from one born from a
        # `.json` full of acts.
        return {"created": True, **{f: v for f, v in changes.items() if f in _ON_ARRIVAL}}
    if not changes and was != now:
        changes["other"] = True
    return changes
