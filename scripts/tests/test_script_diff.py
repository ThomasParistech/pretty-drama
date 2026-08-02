"""The diff a promoted script publishes in the upload journal. The counts read as
instructions ("five lines to record again"), so an off-by-one either sends an actor
back to the mic for nothing or hides a stale recording."""

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
        # Line ids are never recycled, so this is one edit, not a remove plus an add.
        self.assertEqual(
            script_changes(play({"a": "Silence !"}), play({"a": "Silence, enfin !"})),
            {"linesEdited": 1},
        )

    def test_a_purely_typographic_change_is_not_an_edit_but_is_still_a_change(self):
        # Normalized, same rule as `compute_status`: nothing went stale, but the
        # document moved, hence `other`.
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
        # Hence the flattening in `_lines_by_id`: no add plus remove, just `other`.
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
        # A new title is initial state, not a change; `other` is meaningless here.
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
        # The `_new-play` gesture: `new_play_script` builds an empty play.
        empty = {"id": "antigone", "title": "Antigone", "language": "fr", "characters": [], "acts": [{"scenes": [{"lines": []}]}]}
        self.assertEqual(script_changes({}, empty, created=True), {"created": True})

    def test_the_empty_result_is_never_a_lie(self):
        # An empty dict renders as "aucun changement", hence `other`.
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
        # The id is kept, so a castAdded/castRemoved pair would read as a recast.
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
        # Nothing else sees it: keyed by line id, the clip stays, in the old voice.
        before = play({"a": "Un"}, characters=("serge", "annie"))
        after = {
            **before,
            "acts": [{"scenes": [{"lines": [{"id": "a", "characterId": "annie", "text": "Un"}]}]}],
        }
        self.assertEqual(script_changes(before, after), {"linesReassigned": 1})

    def test_a_file_reformatted_but_equivalent_really_is_no_change(self):
        # Reordered keys and an act `title` that `sanitize_script` drops.
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
        # Same tolerance as `sanitize_script`: a journal line never sinks the run.
        good = play({"a": "Un"})
        for bad in (None, [], "nope", 42, {}, {"acts": None}, {"acts": [{"scenes": "x"}]}):
            with self.subTest(repr(bad)):
                self.assertIsInstance(script_changes(bad, good), dict)
                self.assertIsInstance(script_changes(good, bad), dict)

    def test_a_line_with_no_usable_id_is_ignored_rather_than_counted(self):
        # `sanitize_script` drops it, so it must not surface as an addition either.
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
