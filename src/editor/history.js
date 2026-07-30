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
// Le titre de la pièce est dans le lot avec le texte des répliques : c'est un
// champ en clair, donc il se renomme à la frappe et une rafale ne doit faire
// qu'une étape.
//
// **Toute clé identifie son objet par une valeur STABLE**, un id de réplique ou
// rien du tout, et plus jamais par un rang. Les renommages d'acte et de scène
// étaient les seuls à se cléer sur un rang (les actes et les scènes n'ont pas
// d'id), ce qui tenait uniquement parce que tout ce qui déplace un rang a une clé
// nulle et fermait donc la rafale au passage. Ils n'existent plus : un acte et
// une scène ne se renomment pas, leur libellé est dérivé de leur rang
// (structureLabels.js). Cette précaution n'a donc plus d'objet, et il ne faut pas
// la faire revenir sans elle : deux objets différents ne peuvent pas se retrouver
// dans la même étape d'annulation, et c'est testé.
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

// Exportée pour le test qui verrouille l'invariant ci-dessus. Rien d'autre ne la
// consomme.
export { coalesceKey as _coalesceKeyForTests };

// Les champs de haut niveau d'un script, DÉRIVÉS de `EMPTY_SCRIPT` et pas
// recopiés : un cinquième champ ajouté un jour à la pièce entre de lui-même dans
// la comparaison ci-dessous, là où une liste écrite ici la laisserait muette sur
// lui (elle rendrait `saved` alors que ce champ-là aurait changé). Tout état de
// la pile a exactement ces clés, `sanitizeScript` les posant toutes et chaque cas
// du reducer étalant l'état reçu.
const SCRIPT_FIELDS = Object.keys(EMPTY_SCRIPT);

// Un état revenu à ce qui est déjà téléchargé rend l'OBJET `saved` lui-même, et
// pas son sosie : « Modifications non téléchargées » est un comparatif
// d'identité (`present !== saved`, cf. App.jsx), donc sans ça un aller-retour
// laissait l'étiquette allumée sur une pièce identique au fichier du dépôt. Le
// cas qui l'a montré est la langue de la pièce, deux drapeaux dans le plan :
// choisir l'anglais puis revenir au français est un aller-retour complet, en deux
// clics, et le respo n'avait plus alors que Ctrl+Z pour éteindre l'étiquette.
//
// Une comparaison des quatre champs à l'IDENTITÉ, et jamais en profondeur : le
// reducer étant immuable et à structure partagée, un aller-retour sur un champ
// SCALAIRE (le titre, la langue) laisse les trois autres strictement identiques,
// donc la même égalité qui porte déjà toute la pile suffit. C'est aussi ce qui
// borne la promesse, et il faut le savoir : retaper une lettre puis l'effacer
// reconstruit `acts`, donc l'étiquette reste allumée sur un texte pourtant
// identique. La lever demanderait de comparer la pièce entière à chaque frappe,
// c'est-à-dire exactement le travail que l'identité d'objet fait gratuitement.
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
  // "Modifications non téléchargées" label could no longer be cleared).
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

  // Revenu à l'état téléchargé : c'est cet objet-là qu'on repose (cf.
  // `asSavedIfUnchanged`). L'étape s'empile normalement, il n'y a rien
  // d'anormal à annuler un aller-retour ; seule l'étiquette s'éteint.
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
