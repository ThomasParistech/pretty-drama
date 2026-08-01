"""The diff a promoted script publishes in the upload journal.

These counts are the only thing the coordinator will ever read about what their
`script.json` did to the play, and they are read as instructions ("five lines to record
again"). A count that is off by one is not a cosmetic bug here: it either sends somebody
back to the microphone for nothing, or lets a stale recording pass unmentioned.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from script_diff import script_changes


def play(lines, characters=("serge",)):
    """A one-scene play from {line id: text}, with a cast of bare ids."""
    return {
        "id": "le-malade",
        "title": "Le Malade",
        "language": "fr",
        "characters": [{"id": c, "name": c.title()} for c in characters],
        "acts": [
            {
                "scenes": [
                    {"lines": [{"id": i, "characterId": "serge", "text": t} for i, t in lines.items()]}
                ]
            }
        ],
    }


class TestScriptChanges(unittest.TestCase):
    def test_an_identical_script_changes_nothing(self):
        # The re-upload of a file already promoted, and it is a real gesture: the
        # coordinator downloads the script from the Editing page, changes their mind, and
        # uploads it back untouched. The empty dict is what makes the page say so.
        same = play({"aaaa-1111": "Silence !"})
        self.assertEqual(script_changes(same, same), {})

    def test_a_new_line_is_added_and_not_counted_twice(self):
        self.assertEqual(
            script_changes(play({"a": "Un"}), play({"a": "Un", "b": "Deux"})),
            {"linesAdded": 1},
        )

    def test_a_dropped_line_is_removed(self):
        self.assertEqual(
            script_changes(play({"a": "Un", "b": "Deux"}), play({"a": "Un"})),
            {"linesRemoved": 1},
        )

    def test_a_line_that_keeps_its_id_and_changes_its_text_is_EDITED(self):
        # The property the whole diff rests on: line ids are never recycled, so this is
        # one line edited and NOT one removed plus one added. Counting it the other way
        # would report two changes for one correction, on every typo fix.
        self.assertEqual(
            script_changes(play({"a": "Silence !"}), play({"a": "Silence, enfin !"})),
            {"linesEdited": 1},
        )

    def test_a_purely_typographic_change_is_not_an_edit_but_is_still_a_change(self):
        # Measured on NORMALIZED text, the same rule as `compute_status`: a curly
        # apostrophe swapped for a straight one does not make a recording stale, so
        # reporting it as an edit would send an actor back to the microphone for
        # nothing, while the grid next to the journal kept the line green.
        # It is not "no change" either, though (the printed script does move), and that
        # is exactly the register `other` is for.
        self.assertEqual(
            script_changes(play({"a": "J’suis malade"}), play({"a": "J'suis malade..."})),
            {"other": True},
        )

    def test_the_three_line_counts_are_independent(self):
        self.assertEqual(
            script_changes(
                play({"a": "Un", "b": "Deux", "c": "Trois"}),
                play({"a": "Un", "b": "Deux bis", "d": "Quatre"}),
            ),
            {"linesAdded": 1, "linesRemoved": 1, "linesEdited": 1},
        )

    def test_moving_a_line_to_another_scene_costs_nobody_a_recording(self):
        # The play's text did not change, so nobody has anything to record: counting the
        # move as a line added and a line removed would announce work that does not
        # exist. Hence the flattening in `_lines_by_id`. It is a change to the document
        # all the same, so it comes out as `other` and not as silence.
        one_scene = play({"a": "Un", "b": "Deux"})
        two_scenes = {
            **one_scene,
            "acts": [
                {
                    "scenes": [
                        {"lines": [{"id": "a", "characterId": "serge", "text": "Un"}]},
                        {"lines": [{"id": "b", "characterId": "serge", "text": "Deux"}]},
                    ]
                }
            ],
        }
        self.assertEqual(script_changes(one_scene, two_scenes), {"other": True})

    def test_the_cast_is_counted_apart_from_the_lines(self):
        self.assertEqual(
            script_changes(
                play({"a": "Un"}, characters=("serge",)),
                play({"a": "Un"}, characters=("serge", "annie")),
            ),
            {"castAdded": 1},
        )
        self.assertEqual(
            script_changes(
                play({"a": "Un"}, characters=("serge", "annie")),
                play({"a": "Un"}, characters=("serge",)),
            ),
            {"castRemoved": 1},
        )

    def test_a_play_born_from_a_json_reports_its_size_and_nothing_else(self):
        # A birth has nothing to compare against, so it says how big it arrived. NOT
        # "titre modifié": the title of a brand new play is its initial state, and
        # reporting it as a change would describe a correction that never happened. Same
        # for the language, and `other` has no meaning when the whole document is new.
        self.assertEqual(
            script_changes(
                {},
                {
                    **play({"a": "Un", "b": "Deux"}, characters=("serge", "annie")),
                    "title": "Le Malade",
                    "language": "en",
                },
                created=True,
            ),
            {"created": True, "linesAdded": 2, "castAdded": 2},
        )

    def test_a_play_born_from_a_title_says_only_that_it_was_created(self):
        # The `_new-play` gesture: `new_play_script` builds an empty play, so there is
        # nothing to count and that lone mention is what keeps the row from being blank.
        empty = {"id": "antigone", "title": "Antigone", "language": "fr", "characters": [], "acts": [{"scenes": [{"lines": []}]}]}
        self.assertEqual(script_changes({}, empty, created=True), {"created": True})

    def test_the_empty_result_is_never_a_lie(self):
        """THE promise of this module, and the reason `other` exists.

        An empty dict renders as "aucun changement". The first version counted lines and
        cast ids alone, so a renamed character, a retitled play, a language switch, a
        recoloured role and an added scene all came out empty: the coordinator reads
        "no change" about the upload they just made and concludes it failed.
        """
        base = play({"a": "Un"}, characters=("serge",))
        recoloured = {
            **base,
            "characters": [{"id": "serge", "name": "Serge", "color": "#e15759"}],
        }
        added_scene = {**base, "acts": [{"scenes": [base["acts"][0]["scenes"][0], {"lines": []}]}]}
        for name, new, expected in (
            ("renamed", play({"a": "Un"}, characters=("annie",)), None),
            ("retitled", {**base, "title": "Autre titre"}, {"title": True}),
            ("relanguaged", {**base, "language": "en"}, {"language": True}),
            ("recoloured", recoloured, {"other": True}),
            ("scene added", added_scene, {"other": True}),
        ):
            with self.subTest(name):
                changes = script_changes(base, new)
                self.assertNotEqual(changes, {}, "this would render as \"no change\"")
                if expected is not None:
                    self.assertEqual(changes, expected)

    def test_a_rename_is_a_rename_and_not_a_part_changing_hands(self):
        # The character keeps its id, so nobody lost or gained a role: `castAdded` and
        # `castRemoved` would both be wrong, and their pair would read as a recast.
        self.assertEqual(
            script_changes(
                play({"a": "Un"}, characters=("serge",)),
                {
                    **play({"a": "Un"}, characters=("serge",)),
                    "characters": [{"id": "serge", "name": "Sergio"}],
                },
            ),
            {"castRenamed": 1},
        )

    def test_a_line_changing_hands_is_reported_even_though_its_text_did_not_move(self):
        # The one change nothing else on the site can see: the clip is keyed by line id,
        # so it stays attached and the Progress grid keeps showing the line recorded, in
        # the PREVIOUS character's voice. Only this count says so.
        before = play({"a": "Un"}, characters=("serge", "annie"))
        after = {
            **before,
            "acts": [{"scenes": [{"lines": [{"id": "a", "characterId": "annie", "text": "Un"}]}]}],
        }
        self.assertEqual(script_changes(before, after), {"linesReassigned": 1})

    def test_a_file_reformatted_but_equivalent_really_is_no_change(self):
        # The other side of the promise: keys reordered, and the `title` an older format
        # left on an act (which `sanitize_script` drops). Nothing the site reads moved,
        # so "aucun changement" is the truth here.
        base = play({"a": "Un"}, characters=("serge",))
        reformatted = {
            "language": base["language"],
            "title": base["title"],
            "id": base["id"],
            "characters": [{"name": "Serge", "id": "serge"}],
            "acts": [
                {
                    "title": "Acte I",
                    "scenes": [
                        {"title": "Scène 1", "lines": [{"text": "Un", "characterId": "serge", "id": "a"}]}
                    ],
                }
            ],
        }
        self.assertEqual(script_changes(base, reformatted), {})

    def test_a_malformed_script_is_read_leniently_and_never_raises(self):
        # `script.json` is hand-editable in the repository and the candidate just crossed
        # the internet. A journal line must never be the thing that sinks the run: the
        # same tolerance as `sanitize_script`, which both sides go through.
        good = play({"a": "Un"})
        for bad in (None, [], "nope", 42, {}, {"acts": None}, {"acts": [{"scenes": "x"}]}):
            with self.subTest(repr(bad)):
                self.assertIsInstance(script_changes(bad, good), dict)
                self.assertIsInstance(script_changes(good, bad), dict)

    def test_a_line_with_no_usable_id_is_ignored_rather_than_counted(self):
        # `sanitize_script` drops it (it could name no mp3), so it cannot appear as an
        # addition either: the journal would announce a line nobody can ever record.
        broken = {
            **play({"a": "Un"}),
            "acts": [
                {
                    "scenes": [
                        {
                            "lines": [
                                {"id": "a", "characterId": "serge", "text": "Un"},
                                {"characterId": "serge", "text": "Sans identifiant"},
                            ]
                        }
                    ]
                }
            ],
        }
        self.assertEqual(script_changes(play({"a": "Un"}), broken), {})


if __name__ == "__main__":
    unittest.main()
