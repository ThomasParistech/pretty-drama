// Undo/redo stack wrapped AROUND the pure `scriptReducer`. States are structurally
// shared, so a stack entry costs a handful of objects, not a copy of the play.
// `saved` marks the last downloaded script.json: "is there anything to download?" is
// `present !== saved` (App.jsx), an IDENTITY comparison.
import { EMPTY_SCRIPT, scriptReducer } from "./reducer.js";

const HISTORY_LIMIT = 100;

// Keystroke actions: a run on the SAME target merges into one step, otherwise one
// undo = one character. Closed by any other action, by undo/redo, or by HISTORY_BREAK.
// Every key must identify its object by a STABLE value (a line id), never by a rank:
// two different objects must not land in one undo step, and that is tested.
function coalesceKey(action) {
  switch (action.type) {
    case "EDIT_TEXT":
      return `EDIT_TEXT:${action.lineId}`;
    case "SET_TITLE":
      return "SET_TITLE";
    default:
      return null;
  }
}

// Exported for the test that locks down the invariant above.
export { coalesceKey as _coalesceKeyForTests };

// DERIVED from `EMPTY_SCRIPT`, never copied out: a fifth field joins the comparison
// below on its own instead of being silently ignored.
const SCRIPT_FIELDS = Object.keys(EMPTY_SCRIPT);

// A state back at what is already downloaded returns the `saved` OBJECT itself, so
// `present !== saved` goes dark again (round trip on the play's language, two clicks).
// IDENTITY per field, never deep: with a structurally shared reducer a round trip on a
// scalar leaves the others identical. The bound: retyping a letter and deleting it
// rebuilds `acts`, so the label stays lit on identical text.
function asSavedIfUnchanged(present, saved) {
  if (present === saved) return present;
  return SCRIPT_FIELDS.every((field) => present[field] === saved[field]) ? saved : present;
}

export function initHistory(script) {
  return { present: script, past: [], future: [], lastKey: null, saved: script };
}

export function historyReducer(state, action) {
  if (action.type === "UNDO") {
    if (state.past.length === 0) return state;
    return {
      ...state,
      present: state.past[state.past.length - 1],
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
      lastKey: null,
    };
  }

  if (action.type === "REDO") {
    if (state.future.length === 0) return state;
    return {
      ...state,
      present: state.future[0],
      past: [...state.past, state.present],
      future: state.future.slice(1),
      lastKey: null,
    };
  }

  // Script just downloaded: the state on screen becomes the reference. `lastKey` is
  // cleared too, or the next character merges into the step that produced `saved` and
  // no undo can ever land back on it.
  if (action.type === "MARK_SAVED") {
    return state.saved === state.present && state.lastKey === null
      ? state
      : { ...state, saved: state.present, lastKey: null };
  }

  // Field blurred: the next keystroke run on it starts a new step.
  if (action.type === "HISTORY_BREAK") {
    return state.lastKey === null ? state : { ...state, lastKey: null };
  }

  const next = scriptReducer(state.present, action);
  // Action refused by the reducer (empty name…): nothing to record.
  if (next === state.present) return state;

  // Loading the published script IS the starting point, not a step.
  if (action.type === "LOAD_SCRIPT") return initHistory(next);

  // The step is pushed normally; only the label goes out.
  const present = asSavedIfUnchanged(next, state.saved);

  // Continuing a keystroke run: same step, and the future was already dropped by the
  // keystroke that opened it.
  const key = coalesceKey(action);
  if (key !== null && key === state.lastKey) return { ...state, present };

  const past = [...state.past, state.present];
  return {
    ...state,
    present,
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
    lastKey: key,
  };
}
