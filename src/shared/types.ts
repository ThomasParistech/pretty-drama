// The shapes the Python side writes and the pages read. This file is the FRONT's word
// on the JSON contracts already documented in CLAUDE.md, not a second source of truth:
// `script.json` is written by `promote_script`, `manifest.json` by `build_manifest.py`,
// `plays.json` by `build_plays_index.py`, `history.json` by `update_history.py`. A field
// added there and not here is a type error at the first page that reads it, which is the
// whole point of writing them down.
//
// TYPES ONLY, no value: erased at build, so it never reaches a bundle.
//
// Read shapes are deliberately NOT `Partial`: every page already goes through
// `sanitizeScript` or degrades in the component (a hand-edited script.json can say
// anything), so the types describe the document as the Action writes it and the
// tolerance stays where the comments explaining it live.

// ---------------------------------------------------------------- the browser

// Older Safari's prefixed constructor, which `lib.dom` does not declare. Declared here
// ONCE, for the three sites that open an AudioContext (Rehearsal, the Recorder page and
// `useRecorder`): each was casting `window` to `any`, which switches the checker off on
// the whole object to reach one optional property. A `declare global` costs nothing at
// runtime and every file in `include` sees it, imported or not.
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// ---------------------------------------------------------------- i18n

// The two locales. `LOCALES` (i18n.ts) is the value; this is the type, so a third
// language is a compile error at every switch that forgot it.
export type Locale = "fr" | "en";

// What a catalogue entry may be: a string, or the plural forms selected by
// `params.count`. Keyed by CLDR category so `plural.select()` indexes it directly;
// every form is optional because the engine falls back category -> other -> one -> the
// key itself, and `parity.test.ts` is what requires the real catalogues to carry both.
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;

export type Catalogue = Record<string, Message>;

// `t()` parameters: a number is formatted by the engine, never at the call site.
export type TParams = Record<string, string | number | null | undefined>;

// A translator. `parts` is the same lookup returning the sentence CUT at its
// placeholders, so `<T>` can drop React nodes in without freezing French word order.
export interface Translate {
  (key: string, params?: TParams): string;
  parts(key: string, params?: Record<string, unknown>): unknown[];
}

// The locale-driven formatters (`makeFormats`), passed around next to `t`.
export interface Formats {
  number(n: number): string;
  list(parts: string[]): string;
  percent(ratio: number): string;
  dateTime(date: Date | number): string;
  quote(text: string): string;
}

// ---------------------------------------------------------------- script.json

export interface Character {
  id: string;
  name: string;
  color: string;
}

export interface Line {
  id: string;
  // NULL when no character is assigned: `sanitizeScript` clears an id naming a
  // character that does not exist rather than invent one, and a line added to a play
  // with no cast has nobody to attribute it to.
  characterId: string | null;
  text: string;
}

export interface Scene {
  lines: Line[];
}

export interface Act {
  scenes: Scene[];
}

// Exactly the Editor's state, and exactly what `new_play_script` (common.py) writes.
// `language` is the language the PLAY is written in, not the reader's locale.
export interface Script {
  id: string;
  title: string;
  language: string;
  characters: Character[];
  acts: Act[];
}

// ---------------------------------------------------------------- manifest.json

// French because it is DATA, written by `compute_status` (build_manifest.py).
export type LineStatus = "ok" | "perime" | "manquant";

// A script line plus what the join with clips.json knows about it. `clip` is null
// exactly when the status is "manquant".
export interface ManifestLine extends Line {
  character: string;
  status: LineStatus;
  clip: string | null;
  actIndex: number;
  sceneIndex: number;
}

export interface ManifestScene {
  lines: ManifestLine[];
}

export interface ManifestAct {
  scenes: ManifestScene[];
}

// The only file the pages read. `lines` is `acts` flattened, both pointing at the same
// objects, so a page picks whichever traversal it needs.
export interface Manifest {
  id: string;
  title: string;
  language: string;
  history: HistoryRun[];
  characters: Character[];
  acts: ManifestAct[];
  lines: ManifestLine[];
}

// ---------------------------------------------------------------- plays.json

// What a play card needs, counted from the manifest, never recomputed on the front.
export interface PlayEntry {
  id: string;
  title: string;
  language: string;
  characters: number;
  words: number;
  lines: number;
  recorded: number;
}

// ---------------------------------------------------------------- history.json

// The fields `script_changes` (script_diff.py) writes, and every one of them has a
// sentence in `CHANGE_LABEL_KEYS` (dashboard/App.tsx). Counts are numbers, flags are
// true, and an empty value is OMITTED, which is why they are all optional here.
export interface ScriptChanges {
  created?: boolean;
  linesAdded?: number;
  linesRemoved?: number;
  linesEdited?: number;
  linesReassigned?: number;
  castAdded?: number;
  castRemoved?: number;
  castRenamed?: number;
  title?: boolean;
  language?: boolean;
  other?: boolean;
}

// One upload. `kind` is written by `kind_of` (process_uploads.py), hence French.
// `error` present means the file was refused, and the journal is the only place that
// says so. `changes: null` is a journal written before the diff existed.
export interface JournalFile {
  file: string;
  kind?: string;
  error?: string;
  clips?: number;
  changes?: ScriptChanges | null;
}

export interface HistoryRun {
  at: string;
  files: JournalFile[];
}

export interface History {
  runs?: HistoryRun[];
}
