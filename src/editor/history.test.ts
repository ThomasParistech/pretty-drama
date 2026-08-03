// Two things not re-readable by eye: the COALESCING of keystrokes, and the "Changes
// not downloaded" label, which is `present !== saved` and not a flag. Both rest on
// object identity, hence on a rejected action pushing nothing.
import test from "node:test";
import assert from "node:assert/strict";

import { coalesceKey, historyReducer, initHistory } from "./history.ts";
import type { HistoryState } from "./history.ts";
import type { ScriptAction } from "./reducer.ts";
import type { Script } from "../shared/types.ts";

const PLAY: Script = {
  id: "le-misanthrope",
  title: "Le Misanthrope",
  // Every sanitised script carries one: without it the round-trip tests head back to
  // `undefined`, which the reducer rejects, so the return leg never happens.
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

// Two lines: a replacement touches several at once, unlike a keystroke.
const DUO: Script = {
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

const type = (text: string): ScriptAction => ({
  type: "EDIT_TEXT",
  actIndex: 0,
  sceneIndex: 0,
  lineId: "l-1",
  text,
});

const textOf = (state: HistoryState) => state.present.acts[0]!.scenes[0]!.lines[0]!.text;
// The label, exactly as App.tsx derives it.
const dirty = (state: HistoryState) => state.present !== state.saved;

const apply = (state: HistoryState, ...actions: ScriptAction[]) =>
  actions.reduce(historyReducer, state);

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
  const other: ScriptAction = {
    type: "EDIT_TEXT",
    actIndex: 0,
    sceneIndex: 0,
    lineId: "l-2",
    text: "Q",
  };
  const state = apply(initHistory(withTwo), type("L"), other, type("La"));
  assert.equal(state.past.length, 3);
});

// ------------------------------------------------------ the title of the play

test("renaming the play by typing makes only ONE step", () => {
  // A plain field, typed letter by letter: without coalescing, one Ctrl+Z per
  // character. The play's title is the ONLY name left.
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
  // No coalescing key may be a RANK: a rank-keyed action would merge two different
  // objects into one undo step.
  const suspects: ScriptAction[] = [
    { type: "EDIT_TEXT", actIndex: 3, sceneIndex: 2, lineId: "l-1", text: "x" },
    { type: "SET_TITLE", title: "x" },
    { type: "SET_LANGUAGE", language: "en" },
    { type: "MOVE_ACT", from: 0, to: 1 },
    { type: "MOVE_SCENE", actIndex: 0, from: 0, to: 1 },
    { type: "ADD_ACT" },
    { type: "DELETE_ACT", actIndex: 0 },
  ];
  for (const action of suspects) {
    const key = coalesceKey(action);
    if (key === null) continue;
    // Read through a loose view: the point is to sweep the RANK fields whichever
    // action carries them, and each variant of the union carries a different set.
    const ranks = action as Record<string, unknown>;
    for (const field of ["actIndex", "sceneIndex", "from", "to"]) {
      if (ranks[field] === undefined) continue;
      assert.ok(
        !key.includes(String(ranks[field])),
        `${action.type}: the key "${key}" contains the rank ${field}=${ranks[field]}`
      );
    }
  }
});

test("changing the play's language is a step in its own right", () => {
  // A select, not a keystroke: nothing to coalesce, and it must not melt into the
  // title's run right above it.
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
  // A two-click round trip gives a play identical to the repo's. The label being an
  // IDENTITY comparison, equal content is not enough: `saved` itself must come back.
  const start = initHistory(PLAY);
  const away = apply(start, { type: "SET_LANGUAGE", language: "en" });
  assert.notEqual(away.present, away.saved, "outbound: there is indeed something to download");

  const back = apply(away, { type: "SET_LANGUAGE", language: PLAY.language });
  assert.equal(back.present, back.saved, "return: nothing left to download");
  // Still two undoable steps: history is not rewritten, only the identity restored.
  assert.equal(back.past.length, 2);
  assert.equal(historyReducer(back, { type: "UNDO" }).present.language, "en");
});

test("a round trip on the title switches the label off, even mid-burst", () => {
  // The substitution must hold in the COALESCING branch too, or "type a letter, then
  // delete it" leaves the label on.
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
  // A title back at its value while the lines changed must never pass for saved.
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
  // Otherwise Ctrl+Z walks empty steps and the label lights with nothing modified.
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
  // The reason for a batch action: a loop of EDIT_TEXT makes one step per line.
  const before = initHistory(DUO);
  const state = historyReducer(before, {
    type: "SET_LINE_TEXTS",
    edits: [
      { lineId: "l-1", text: "un terme" },
      { lineId: "l-2", text: "un terme aussi" },
    ],
  });
  assert.equal(state.past.length, 1);
  // The OBJECT from before, not an equivalent: that is what lets `dirty` use identity.
  assert.equal(historyReducer(state, { type: "UNDO" }).present, before.present);
});

test("a replacement never coalesces with a burst of keystrokes", () => {
  // With an EDIT_TEXT the run would stay OPEN on that line and one Ctrl+Z would undo
  // the next keystroke with it.
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
  // Back at what is published, though the past is not empty.
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
  // MARK_SAVED resets lastKey, or the next keystroke coalesces into the step that
  // produced `saved` and no Ctrl+Z can land back on it.
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
  // The oldest entry kept is a recent one, not the original.
  assert.notEqual(state.past[0].title, PLAY.title);
});
