// Tests for the editor's undo stack.
//
// Two things play out here that cannot be re-read by eye: the COALESCING of
// keystrokes (without it, one Ctrl+Z = one letter) and the "Changes not
// downloaded" label, which is not a flag but a `present !== saved`
// comparison. Both rest on the identity of the state objects, hence on the
// fact that a rejected action pushes nothing.
import test from "node:test";
import assert from "node:assert/strict";

import { _coalesceKeyForTests, historyReducer, initHistory } from "./history.js";

const PLAY = {
  title: "Le Misanthrope",
  // The language of the PLAY, as every sanitised script carries one: without it,
  // the round trip of the two label tests headed back to `undefined`, which the
  // reducer rejects (`isLocale`), so the return leg never happened.
  language: "fr",
  characters: [{ id: "c-alceste", name: "Alceste", color: "#1f77b4" }],
  acts: [
    {
      scenes: [
        {
          lines: [{ id: "l-1", characterId: "c-alceste", text: "" }],
        },
      ],
    },
  ],
};

// Two lines: a replacement touches several at once, which is what tells it
// apart from a keystroke.
const DUO = {
  ...PLAY,
  acts: [
    {
      scenes: [
        {
          lines: [
            { id: "l-1", characterId: "c-alceste", text: "un mot" },
            { id: "l-2", characterId: "c-alceste", text: "un mot aussi" },
          ],
        },
      ],
    },
  ],
};

const type = (text) => ({
  type: "EDIT_TEXT",
  actIndex: 0,
  sceneIndex: 0,
  lineId: "l-1",
  text,
});

const textOf = (state) => state.present.acts[0].scenes[0].lines[0].text;
// The editor's "Changes not downloaded" label, exactly as App.jsx derives it.
const dirty = (state) => state.present !== state.saved;

const apply = (state, ...actions) => actions.reduce(historyReducer, state);

test("at the start: nothing to undo, nothing to download", () => {
  const state = initHistory(PLAY);
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 0);
  assert.equal(dirty(state), false);
});

test("a burst of keystrokes on the SAME line makes a single step", () => {
  const state = apply(initHistory(PLAY), type("L"), type("La"), type("Lai"), type("Laissez"));
  assert.equal(textOf(state), "Laissez");
  assert.equal(state.past.length, 1, "a single step for the whole burst");
  const undone = historyReducer(state, { type: "UNDO" });
  assert.equal(textOf(undone), "", "one Ctrl+Z goes back to before the burst");
});

test("HISTORY_BREAK (field left) closes the burst in progress", () => {
  const state = apply(
    initHistory(PLAY),
    type("La"),
    { type: "HISTORY_BREAK" },
    type("Laissez")
  );
  assert.equal(state.past.length, 2);
  assert.equal(textOf(historyReducer(state, { type: "UNDO" })), "La");
});

test("an action of another kind closes the burst", () => {
  const state = apply(
    initHistory(PLAY),
    type("La"),
    { type: "SET_TITLE", title: "Autre titre" },
    type("Laissez")
  );
  assert.equal(state.past.length, 3);
});

test("keystrokes on TWO different lines do not coalesce", () => {
  const withTwo = {
    ...PLAY,
    acts: [
      {
        ...PLAY.acts[0],
        scenes: [
          {
            ...PLAY.acts[0].scenes[0],
            lines: [
              { id: "l-1", characterId: "c-alceste", text: "" },
              { id: "l-2", characterId: "c-alceste", text: "" },
            ],
          },
        ],
      },
    ],
  };
  const other = { type: "EDIT_TEXT", actIndex: 0, sceneIndex: 0, lineId: "l-2", text: "Q" };
  const state = apply(initHistory(withTwo), type("L"), other, type("La"));
  assert.equal(state.past.length, 3);
});

// ------------------------------------------------------ the title of the play

test("renaming the play by typing makes only ONE step", () => {
  // It is a plain field, so it is renamed letter by letter like the text of a
  // line: without coalescing, going back on a title would take one Ctrl+Z per
  // character. The title of the play is the ONLY name left, acts and scenes
  // deriving their label from their rank.
  const state = apply(
    initHistory(PLAY),
    { type: "SET_TITLE", title: "L" },
    { type: "SET_TITLE", title: "Le M" },
    { type: "SET_TITLE", title: "Le Misanthrope" }
  );
  assert.equal(state.present.title, "Le Misanthrope");
  assert.equal(state.past.length, 1);
  assert.equal(historyReducer(state, { type: "UNDO" }).present.title, PLAY.title);
});

test("no coalescing key identifies its object by a RANK", () => {
  // The invariant that replaces an old precaution. Act and scene renames were
  // keyed on a rank, for lack of an id, and that only held because everything
  // that moves a rank closes the burst. They no longer exist, so not a single
  // key is a rank any more, and that has to stay true: a rank-keyed action added
  // without this precaution would coalesce two different objects into the same
  // undo step.
  const suspects = [
    { type: "EDIT_TEXT", actIndex: 3, sceneIndex: 2, lineId: "l-1", text: "x" },
    { type: "SET_TITLE", title: "x" },
    { type: "SET_LANGUAGE", language: "en" },
    { type: "MOVE_ACT", from: 0, to: 1 },
    { type: "MOVE_SCENE", actIndex: 0, from: 0, to: 1 },
    { type: "ADD_ACT" },
    { type: "DELETE_ACT", actIndex: 0 },
  ];
  for (const action of suspects) {
    const key = _coalesceKeyForTests(action);
    if (key === null) continue;
    for (const field of ["actIndex", "sceneIndex", "from", "to"]) {
      if (action[field] === undefined) continue;
      assert.ok(
        !key.includes(String(action[field])),
        `${action.type}: the key "${key}" contains the rank ${field}=${action[field]}`
      );
    }
  }
});

test("changing the play's language is a step in its own right", () => {
  // It is a select, not a keystroke: nothing to coalesce, and above all it must
  // not melt into the burst of the title right above it in the panel.
  const state = apply(
    initHistory(PLAY),
    { type: "SET_TITLE", title: "Autre" },
    { type: "SET_LANGUAGE", language: "en" },
    { type: "SET_TITLE", title: "Encore" }
  );
  assert.equal(state.past.length, 3);
  assert.equal(state.present.language, "en");
});

test("a round trip on the language switches off \"Changes not downloaded\"", () => {
  // Two flags in the outline: choosing English then coming back to French gives
  // a play identical to the file in the repository, so there is nothing left to
  // download. The label being an IDENTITY comparison (`present !== saved`, cf.
  // App.jsx), it is not enough for the content to be equal: it is the `saved`
  // object itself that has to be put back.
  const start = initHistory(PLAY);
  const away = apply(start, { type: "SET_LANGUAGE", language: "en" });
  assert.notEqual(away.present, away.saved, "outbound: there is indeed something to download");

  const back = apply(away, { type: "SET_LANGUAGE", language: PLAY.language });
  assert.equal(back.present, back.saved, "return: nothing left to download");
  // The round trip remains two undoable steps: we do not rewrite history, we
  // only give back its identity to the starting state.
  assert.equal(back.past.length, 2);
  assert.equal(historyReducer(back, { type: "UNDO" }).present.language, "en");
});

test("a round trip on the title switches the label off, even mid-burst", () => {
  // Same mechanics on a text field, where keystrokes coalesce: the substitution
  // has to hold in the coalescing branch too, otherwise the most common gesture
  // (type a letter, think again, delete it) left the label on.
  const start = initHistory(PLAY);
  const state = apply(
    start,
    { type: "SET_TITLE", title: "Le Misanthrope!" },
    { type: "SET_TITLE", title: PLAY.title }
  );
  assert.equal(state.present, state.saved);
  assert.equal(state.past.length, 1, "a single step: the burst did coalesce");
});

test("the label switches off ONLY on a truly identical state", () => {
  // The guard's guard: the substitution compares the fields by identity, so a
  // play whose title has come back to its value but whose lines have changed in
  // the meantime must never pass for downloaded.
  const start = initHistory(PLAY);
  const state = apply(
    start,
    { type: "SET_TITLE", title: "Autre" },
    type("Laissez"),
    { type: "SET_TITLE", title: PLAY.title }
  );
  assert.notEqual(state.present, state.saved);
});

test("undo then redo comes back to exactly the same state", () => {
  const edited = apply(initHistory(PLAY), type("Laissez"));
  const roundTrip = apply(edited, { type: "UNDO" }, { type: "REDO" });
  assert.equal(roundTrip.present, edited.present, "the same object, not a copy");
});

test("a new edit after a step back cuts the redoable branch", () => {
  const state = apply(
    initHistory(PLAY),
    type("Laissez"),
    { type: "UNDO" },
    { type: "SET_TITLE", title: "Autre" }
  );
  assert.equal(state.future.length, 0);
});

test("undo with no past, redo with no future: nothing moves", () => {
  const state = initHistory(PLAY);
  assert.equal(historyReducer(state, { type: "UNDO" }), state);
  assert.equal(historyReducer(state, { type: "REDO" }), state);
});

test("an action rejected by the reducer pushes no step", () => {
  // Otherwise Ctrl+Z would have empty steps to walk through, and the "Changes
  // not downloaded" label would light up with nothing modified.
  const state = apply(
    initHistory(PLAY),
    { type: "ADD_CHARACTER", id: "c-neuf", name: "   " },
    { type: "MOVE_LINE", actIndex: 0, sceneIndex: 0, activeId: "l-1", overId: "l-1" }
  );
  assert.equal(state.past.length, 0);
  assert.equal(dirty(state), false);
});

// ------------------------------------------- replacement (search)

test("replacing across several lines makes only ONE undo step", () => {
  // That is the whole reason for a batch action: a loop of EDIT_TEXT would have
  // made one per line (the coalescing keys differ by lineId), hence as many
  // Ctrl+Z as lines touched.
  const before = initHistory(DUO);
  const state = historyReducer(before, {
    type: "SET_LINE_TEXTS",
    edits: [
      { lineId: "l-1", text: "un terme" },
      { lineId: "l-2", text: "un terme aussi" },
    ],
  });
  assert.equal(state.past.length, 1);
  // The stack restores the OBJECT from before, not an equivalent: that is what
  // lets `dirty` compare by identity.
  assert.equal(historyReducer(state, { type: "UNDO" }).present, before.present);
});

test("a replacement never coalesces with a burst of keystrokes", () => {
  // Neither one way nor the other. With an EDIT_TEXT instead, the replacement
  // would have left the burst OPEN on that line, and a single Ctrl+Z would have
  // undone the next keystroke along with it.
  const state = apply(
    initHistory(PLAY),
    type("La"),
    { type: "SET_LINE_TEXTS", edits: [{ lineId: "l-1", text: "Remplacé" }] },
    type("Lb")
  );
  assert.equal(state.past.length, 3);
});

test("a replacement with no match pushes nothing and does not light the label", () => {
  const state = apply(initHistory(PLAY), { type: "SET_LINE_TEXTS", edits: [] });
  assert.equal(state.past.length, 0);
  assert.equal(dirty(state), false);
});

// -------------------------------- "Changes not downloaded"

test("the label lights up on the first real modification", () => {
  assert.equal(dirty(apply(initHistory(PLAY), type("Laissez"))), true);
});

test("downloading switches the label off", () => {
  const state = apply(initHistory(PLAY), type("Laissez"), { type: "MARK_SAVED" });
  assert.equal(dirty(state), false);
});

test("undoing back to the downloaded state switches the label off, stack not empty", () => {
  // Edit, download, edit, undo: we are back to what is published, so there is
  // nothing to download, even though the past is not empty.
  const state = apply(
    initHistory(PLAY),
    type("Laissez"),
    { type: "MARK_SAVED" },
    { type: "HISTORY_BREAK" },
    type("Laissez-moi"),
    { type: "UNDO" }
  );
  assert.ok(state.past.length > 0);
  assert.equal(dirty(state), false);
});

test("after a download, the next keystroke opens a NEW step", () => {
  // MARK_SAVED resets lastKey: without that, the next keystroke would coalesce
  // into the step that produced `saved`, and no Ctrl+Z would ever land back on
  // it (the label could no longer switch off).
  const state = apply(
    initHistory(PLAY),
    type("Laissez"),
    { type: "MARK_SAVED" },
    type("Laissez-moi")
  );
  assert.equal(dirty(state), true);
  assert.equal(dirty(historyReducer(state, { type: "UNDO" })), false);
});

test("loading the published script resets the stack and is not a step", () => {
  const state = apply(
    initHistory(PLAY),
    type("Laissez"),
    { type: "LOAD_SCRIPT", script: PLAY }
  );
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 0);
  assert.equal(dirty(state), false);
});

test("the past is capped, and it is the oldest that goes", () => {
  let state = initHistory(PLAY);
  for (let i = 0; i < 150; i++) {
    state = apply(state, { type: "SET_TITLE", title: `Titre ${i}` }, { type: "HISTORY_BREAK" });
  }
  assert.equal(state.past.length, 100);
  assert.equal(state.present.title, "Titre 149");
  // The oldest entry kept really is a recent one, not the original.
  assert.notEqual(state.past[0].title, PLAY.title);
});
