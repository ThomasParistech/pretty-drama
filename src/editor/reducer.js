// Editor state = exactly the script.json content; every action produces the next
// valid one. Line ids are UUIDs, NEVER reused (they name the mp3s), unique, and match
// SAFE_ID; only ADD_LINE mints one, and a line cites its character by id.
// UUIDs are minted by the EVENT HANDLERS and carried in the action: the reducer stays
// pure. Exception: sanitizeScript, which only runs on LOAD_SCRIPT.
// Every import here is pure, so this module runs under `node --test`; locale.js would
// not be (it reads `window` on import).

import { firstFreeColor, isPaletteColor } from "../shared/characterColors.js";
import { DEFAULT_LOCALE, isLocale } from "../shared/i18n.js";
import { isPlayId } from "../shared/plays.js";

export function newId() {
  return crypto.randomUUID();
}

// Mirror of LINE_ID_PATTERN in scripts/process_uploads.py, keep in sync.
export const SAFE_ID = /^[0-9a-zA-Z-]{1,64}$/;

// Acts and scenes carry NO title: a stored one would be data in one language
// travelling to the manifest, the PDF and the Progress columns. Accepted cost, an act
// cannot be called "Prologue".
// `language` is the language the PLAY is written in, not the reader's locale: it
// drives build_script_pdf.py's headings and babel, and the synthetic voice.
// `id` names the play's folder and upload zone. The editor NEVER mints or changes it,
// it copies it through so the Action knows which play an upload updates.
// Contract: `new_play_script` (scripts/common.py) has the same fields.
export const EMPTY_SCRIPT = {
  id: "",
  title: "",
  language: DEFAULT_LOCALE,
  characters: [],
  acts: [{ scenes: [{ lines: [] }] }],
};

const isId = (value) => typeof value === "string" && SAFE_ID.test(value);

// Defensive normalisation of a loaded script.json, which can be hand-edited on
// github.com. Tolerantly mirrored by `sanitize_script` (Python), with three deliberate
// asymmetries; see CLAUDE.md.
export function sanitizeScript(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) raw = {};

  const seenIds = new Set();
  // ONLY for a character reminted because its id was outside SAFE_ID, so its lines
  // follow it. A DUPLICATED id is deliberately NOT entered: the FIRST holder keeps the
  // id and its lines, the second leaves with a fresh id and none. sanitizeScript never
  // moves a line between characters.
  const characterRemap = new Map();

  const usedColors = new Set();
  // Distinct from `usedColors.size`, which stops growing once the palette is
  // exhausted; see `firstFreeColor`.
  let assignedColors = 0;
  const characters = (Array.isArray(raw.characters) ? raw.characters : [])
    .filter((c) => c && typeof c === "object" && typeof c.name === "string" && c.name.trim())
    .map((c) => {
      let id = c.id;
      if (!isId(id) || seenIds.has(id)) {
        const fresh = newId();
        // Invalid id and not a duplicate: it is borne by this one alone, so its
        // lines can follow without ambiguity.
        if (!isId(id) && typeof id === "string" && id) characterRemap.set(id, fresh);
        id = fresh;
      }
      seenIds.add(id);
      // Same deterministic filling in as `assignColors`, which the manifest-reading
      // pages apply: the two must agree on a script with no colours.
      const color =
        isPaletteColor(c.color) && !usedColors.has(c.color.toLowerCase())
          ? c.color.toLowerCase()
          : firstFreeColor(usedColors, assignedColors);
      usedColors.add(color);
      assignedColors += 1;
      return { id, name: c.name, color };
    });
  const characterIds = new Set(characters.map((c) => c.id));

  const sanitizeLine = (l) => {
    if (!l || typeof l !== "object") return null;
    let id = l.id;
    if (!isId(id) || seenIds.has(id)) id = newId();
    seenIds.add(id);
    // Consulted on the RAW value, BEFORE any SAFE_ID check: the ids it holds are
    // exactly the ones that fail it, so validating first orphans the lines.
    let characterId = typeof l.characterId === "string" ? l.characterId : null;
    if (characterId && characterRemap.has(characterId)) characterId = characterRemap.get(characterId);
    // `characterIds` holds valid ids only, so this one test rejects both an id
    // outside SAFE_ID and a character that does not exist.
    if (characterId && !characterIds.has(characterId)) characterId = null;
    return { id, characterId, text: typeof l.text === "string" ? l.text : "" };
  };

  return {
    // COPIED, never reminted, unlike the ids above: a fresh one would send the next
    // download to a play that does not exist. An unusable value yields "", which the
    // Action refuses rather than guess a destination.
    id: isPlayId(raw.id) ? raw.id : "",
    title: typeof raw.title === "string" ? raw.title : "",
    // An unknown or absent language falls back to the default, so an older
    // script.json keeps working.
    language: isLocale(raw.language) ? raw.language : DEFAULT_LOCALE,
    characters,
    acts:
      Array.isArray(raw.acts) && raw.acts.length > 0
        ? raw.acts
            .filter((act) => act && typeof act === "object")
            .map((act) => ({
              // A leftover `title` is DROPPED: two ways of naming a scene would be
              // back in the format.
              scenes:
                Array.isArray(act.scenes) && act.scenes.length > 0
                  ? act.scenes
                      .filter((scene) => scene && typeof scene === "object")
                      .map((scene) => ({
                        lines: Array.isArray(scene.lines)
                          ? scene.lines.map(sanitizeLine).filter(Boolean)
                          : [],
                      }))
                  : [{ lines: [] }],
            }))
        : EMPTY_SCRIPT.acts,
  };
}

export function allLines(script) {
  return script.acts.flatMap((a) => a.scenes.flatMap((s) => s.lines));
}

// Enter continues the current speaker, else the play's first character.
function defaultCharacterId(scene, idx, characters) {
  return scene.lines[idx]?.characterId ?? characters[0]?.id ?? null;
}

// Immutable update of one scene: only that scene changes identity, so React.memo
// skips the rest of the play.
// A NO-OP MUST NOT CREATE A NEW STATE: `fn` returning the scene as is returns the
// STATE as is, because history.js recognises a refused action by identity. Otherwise
// dropping a line back where it was lights "Changes not downloaded" and leaves an
// empty step to undo.
function updateScene(state, actIndex, sceneIndex, fn) {
  const act = state.acts[actIndex];
  const scene = act?.scenes?.[sceneIndex];
  if (!scene) return state;
  const nextScene = fn(scene);
  if (nextScene === scene) return state;
  return {
    ...state,
    acts: state.acts.map((act, ai) =>
      ai !== actIndex
        ? act
        : {
            ...act,
            scenes: act.scenes.map((s, si) => (si !== sceneIndex ? s : nextScene)),
          }
    ),
  };
}

function mapAllLines(state, fn) {
  return {
    ...state,
    acts: state.acts.map((act) => ({
      ...act,
      scenes: act.scenes.map((scene) => ({
        ...scene,
        lines: scene.lines.map(fn).filter(Boolean),
      })),
    })),
  };
}

// A batch of line texts in ONE state. Unlike mapAllLines it returns the EXACT state
// received when nothing changes (the no-op rule above) and keeps every untouched
// identity, so React.memo still skips them.
// Line ids are unique across the WHOLE play, so a Map by id needs no indices.
function applyTextEdits(state, edits) {
  if (!Array.isArray(edits) || edits.length === 0) return state;
  const byLine = new Map();
  for (const edit of edits) {
    // A malformed entry is a caller bug: ignore it rather than throw mid-replacement.
    if (edit && typeof edit.lineId === "string" && typeof edit.text === "string") {
      byLine.set(edit.lineId, edit.text);
    }
  }
  if (byLine.size === 0) return state;

  let changed = false;
  const acts = state.acts.map((act) => {
    let actChanged = false;
    const scenes = act.scenes.map((scene) => {
      let sceneChanged = false;
      const lines = scene.lines.map((line) => {
        if (!byLine.has(line.id)) return line;
        const text = byLine.get(line.id);
        if (text === line.text) return line;
        sceneChanged = true;
        return { ...line, text };
      });
      if (!sceneChanged) return scene;
      actChanged = true;
      return { ...scene, lines };
    });
    if (!actChanged) return act;
    changed = true;
    return { ...act, scenes };
  });
  return changed ? { ...state, acts } : state;
}

// `null` when there is nothing to do, so both callers can return the EXACT state they
// received: same no-op rule as updateScene.
function moved(list, from, to) {
  const ok = (i) => Number.isInteger(i) && i >= 0 && i < list.length;
  if (!ok(from) || !ok(to) || from === to) return null;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// The editor shows one scene, designated by two RANKS, so reshuffling the plan moves
// it under the reader. These two live next to MOVE_*/DELETE_* because they must
// describe exactly the permutation those actions apply.

// Follow-up rank after a `from` -> `to` move.
export function indexAfterMove(index, from, to) {
  if (index === from) return to;
  if (from < index && index <= to) return index - 1;
  if (to <= index && index < from) return index + 1;
  return index;
}

// Follow-up rank after a deletion. When the watched element disappears we step BACK,
// to the one that was in front of it, not to whatever took its rank.
export function indexAfterRemoval(index, removed) {
  if (index === removed) return Math.max(0, removed - 1);
  return index > removed ? index - 1 : index;
}

export function scriptReducer(state, action) {
  switch (action.type) {
    case "LOAD_SCRIPT":
      return sanitizeScript(action.script);

    // Not defensive: the no-op invariant. Pasting the same title fires the event with
    // an identical value, and without this the step is pushed anyway, lighting a
    // Ctrl+Z that changes nothing.
    case "SET_TITLE":
      if (action.title === state.title) return state;
      return { ...state, title: action.title };

    case "SET_LANGUAGE":
      if (!isLocale(action.language) || action.language === state.language) return state;
      return { ...state, language: action.language };

    // ---- Characters (side panel referential) ----

    case "ADD_CHARACTER": {
      const name = action.name.trim();
      if (!name) return state;
      const color = firstFreeColor(
        new Set(state.characters.map((c) => c.color)),
        state.characters.length
      );
      return {
        ...state,
        characters: [...state.characters, { id: action.id, name, color }],
      };
    }

    case "SET_CHARACTER_COLOR":
      if (!isPaletteColor(action.color)) return state;
      return {
        ...state,
        characters: state.characters.map((c) =>
          c.id === action.id ? { ...c, color: action.color } : c
        ),
      };

    case "RENAME_CHARACTER": {
      const name = action.name.trim();
      if (!name) return state;
      // No line id changes, so no recording goes stale on a rename.
      return {
        ...state,
        characters: state.characters.map((c) => (c.id === action.id ? { ...c, name } : c)),
      };
    }

    case "DELETE_CHARACTER": {
      // `mode`: "reassign" (to `reassignTo`) or "deleteLines".
      let next = state;
      if (action.mode === "reassign" && action.reassignTo != null) {
        next = mapAllLines(next, (l) =>
          l.characterId === action.id ? { ...l, characterId: action.reassignTo } : l
        );
      } else {
        next = mapAllLines(next, (l) => (l.characterId === action.id ? null : l));
      }
      return {
        ...next,
        characters: next.characters.filter((c) => c.id !== action.id),
      };
    }

    // ---- Acts & scenes ----

    case "ADD_ACT":
      return { ...state, acts: [...state.acts, { scenes: [{ lines: [] }] }] };

    case "DELETE_ACT":
      return { ...state, acts: state.acts.filter((_, i) => i !== action.actIndex) };

    case "ADD_SCENE":
      return {
        ...state,
        acts: state.acts.map((a, i) =>
          i !== action.actIndex ? a : { ...a, scenes: [...a.scenes, { lines: [] }] }
        ),
      };

    case "DELETE_SCENE":
      return {
        ...state,
        acts: state.acts.map((a, i) =>
          i !== action.actIndex ? a : { ...a, scenes: a.scenes.filter((_, si) => si !== action.sceneIndex) }
        ),
      };

    // Acts and scenes have no id, so a move is a pair of RANKS, unlike MOVE_LINE. The
    // lines carried along keep their ids, hence their mp3s. A scene never changes act:
    // that keeps the action to one container index.
    case "MOVE_ACT": {
      const acts = moved(state.acts, action.from, action.to);
      return acts ? { ...state, acts } : state;
    }

    case "MOVE_SCENE": {
      const act = state.acts[action.actIndex];
      if (!act) return state;
      const scenes = moved(act.scenes, action.from, action.to);
      if (!scenes) return state;
      return {
        ...state,
        acts: state.acts.map((a, i) => (i !== action.actIndex ? a : { ...a, scenes })),
      };
    }

    // ---- Lines (scoped to one scene: O(scene), not O(play)) ----

    case "ADD_LINE": {
      // Insert after `afterLineId`, or append when null. `action.id` is minted by the
      // caller, which also uses it to focus the new textarea.
      return updateScene(state, action.actIndex, action.sceneIndex, (scene) => {
        const idx =
          action.afterLineId == null
            ? scene.lines.length - 1
            : scene.lines.findIndex((l) => l.id === action.afterLineId);
        const newLine = {
          id: action.id,
          characterId: defaultCharacterId(scene, idx, state.characters),
          text: "",
        };
        const lines = [...scene.lines];
        lines.splice(idx + 1, 0, newLine);
        return { ...scene, lines };
      });
    }

    case "EDIT_TEXT":
      return updateScene(state, action.actIndex, action.sceneIndex, (scene) => {
        const line = scene.lines.find((l) => l.id === action.lineId);
        // The no-op rule again: `map` would always allocate a new scene, and a
        // keystroke that changes nothing would leave an empty step to undo.
        if (!line || line.text === action.text) return scene;
        return {
          ...scene,
          lines: scene.lines.map((l) => (l.id === action.lineId ? { ...l, text: action.text } : l)),
        };
      });

    // The only "lines" case crossing the whole play, because a replacement does.
    // Named for what it does to the script: the reducer knows nothing about a search.
    case "SET_LINE_TEXTS":
      return applyTextEdits(state, action.edits);

    case "SET_LINE_CHARACTER":
      return updateScene(state, action.actIndex, action.sceneIndex, (scene) => ({
        ...scene,
        lines: scene.lines.map((l) =>
          l.id === action.lineId ? { ...l, characterId: action.characterId } : l
        ),
      }));

    case "DELETE_LINE":
      return updateScene(state, action.actIndex, action.sceneIndex, (scene) => ({
        ...scene,
        lines: scene.lines.filter((l) => l.id !== action.lineId),
      }));

    case "MOVE_LINE": {
      // The moved line keeps its id: ids travel with the object.
      return updateScene(state, action.actIndex, action.sceneIndex, (scene) => {
        const from = scene.lines.findIndex((l) => l.id === action.activeId);
        const to = scene.lines.findIndex((l) => l.id === action.overId);
        if (from === -1 || to === -1 || from === to) return scene;
        const lines = [...scene.lines];
        const [moved] = lines.splice(from, 1);
        lines.splice(to, 0, moved);
        return { ...scene, lines };
      });
    }

    default:
      return state;
  }
}
