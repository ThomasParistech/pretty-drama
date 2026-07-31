// Undo/redo stack for the editor, wrapped AROUND scriptReducer.
//
// scriptReducer stays untouched (pure, one action = one valid script.json);
// this layer only remembers the surrounding scripts. States are structurally
// shared (every scriptReducer case rebuilds only the touched act/scene), so a
// stack entry costs a handful of objects, not a copy of the play.
//
// Classic model: `past` behind, `future` ahead, and any NEW edit drops the
// future (the timeline forks, we keep the branch the user just took).
//
// `saved` marks the state that matches the last downloaded script.json (the
// loaded script at first). It lives here because the answer to "is there
// anything to download?" is a comparison between two states of this stack:
// undoing back to `saved` means there is nothing left to download.
import { EMPTY_SCRIPT, scriptReducer } from "./reducer.js";

// Bounded stack: an editing session can easily produce thousands of steps and
// the oldest ones are never reached in practice.
const HISTORY_LIMIT = 100;

// Actions dispatched on EVERY keystroke: a run of them on the SAME target is
// merged into a single step (otherwise one undo = one character). The run is
// closed by any other action, by an undo/redo, or by HISTORY_BREAK (field
// blurred). Everything else (add/delete/move) is one step per action.
//
// The play's title is in the batch along with the text of the lines: it is a plain
// field, so it is renamed as one types and a run must make only one step.
//
// **Every key identifies its object by a STABLE value**, a line id or nothing at
// all, and never again by a rank. The act and scene renames were the only ones keyed
// on a rank (acts and scenes have no id), which held solely because everything that
// moves a rank has a null key and therefore closed the run along the way. They no
// longer exist: an act and a scene are not renamed, their label is derived from their
// rank (structureLabels.js). So this precaution no longer has any object, and it must
// not be brought back without it: two different objects cannot end up in the same
// undo step, and that is tested.
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

// Exported for the test that locks down the invariant above. Nothing else consumes
// it.
export { coalesceKey as _coalesceKeyForTests };

// A script's top-level fields, DERIVED from `EMPTY_SCRIPT` and not copied out: a
// fifth field added to the play one day enters the comparison below on its own,
// where a list written here would leave it silent about that field (it would return
// `saved` even though that very field had changed). Every state of the stack has
// exactly these keys, since `sanitizeScript` sets them all and every case of the
// reducer spreads the state it received.
const SCRIPT_FIELDS = Object.keys(EMPTY_SCRIPT);

// A state that has come back to what is already downloaded returns the `saved`
// OBJECT itself, and not its look-alike: "Changes not downloaded" is a comparison of
// identity (`present !== saved`, see App.jsx), so without this a round trip left the
// label lit on a play identical to the file in the repo. The case that showed it is
// the play's language, two flags in the plan: choosing English then coming back to
// French is a complete round trip, in two clicks, and the coordinator was then left
// with nothing but Ctrl+Z to turn the label off.
//
// A comparison of the four fields by IDENTITY, and never a deep one: since the
// reducer is immutable and structurally shared, a round trip on a SCALAR field (the
// title, the language) leaves the other three strictly identical, so the very
// equality that already carries the whole stack is enough. That is also what bounds
// the promise, and it has to be known: retyping a letter then deleting it rebuilds
// `acts`, so the label stays lit on a text that is nonetheless identical. Lifting
// that would require comparing the whole play on every keystroke, that is to say
// exactly the work that object identity does for free.
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

  // Script just downloaded: the state on screen becomes the reference.
  // lastKey is cleared too, so a keystroke run that resumes on the same field
  // opens a NEW step: without that, the next character would merge into the
  // step that produced `saved`, and no undo would ever land back on it (the
  // "Changes not downloaded" label could no longer be cleared).
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

  // Back at the downloaded state: it is that very object we put back (see
  // `asSavedIfUnchanged`). The step is pushed normally, there is nothing abnormal
  // about undoing a round trip; only the label goes out.
  const present = asSavedIfUnchanged(next, state.saved);

  // Continuation of a keystroke run: same step, and the future was already
  // dropped by the keystroke that opened the run.
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
