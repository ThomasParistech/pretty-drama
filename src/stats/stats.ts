// All the maths of the Speaking share page. PURE so `node --test` can replay it; App.tsx
// only draws. The pie charts count LINES; merging consecutive lines of one character serves
// the block alone, where they would be two adjacent same-coloured rectangles.

// Twin of `count_words` (scripts/): apostrophes separate, so "l'crâne" is two words. Only
// proportions are shown, so the site and the troupe's PDF agree. The manifest is
// hand-editable, hence the tolerance.
import type { ManifestLine } from "../shared/types.ts";

// One legend row: a bucket, its cast name when it has one, and what it says.
export interface SpeechRow {
  id: string;
  name: string | null;
  words: number;
  lines: number;
}

// What the block draws: one rectangle per RUN of consecutive words of one bucket.
export interface BlockRect {
  x: number;
  y: number;
  width: number;
  characterId: string;
}

// The three shapes of a scope, in RANKS: the caller phrases them.
export type Scope =
  | { kind: "all"; actIndex?: undefined; sceneIndex?: undefined }
  | { kind: "act"; actIndex: number; sceneIndex?: undefined }
  | { kind: "scene"; actIndex: number; sceneIndex: number };

export function countWords(text: unknown): number {
  if (typeof text !== "string") return 0;
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

// A rank of -1 means "all of this level".
export const ALL = -1;

// Any unusable rank means "all", not -1 alone: -5 fell back on the first scene and a NaN
// (a `Number("")` from a select) returned nothing.
const isAll = (index: number) => !Number.isInteger(index) || index < 0;

// Never an optimistic access: a stale, too-large rank would make the page read as empty.
const clampIndex = (index: number, length: number) => Math.max(0, Math.min(index, length - 1));

// In the play's order: that order is the only information the block carries beyond colour.
export function scopeLines(
  // `unknown` on purpose, at all four doors of this module: the manifest is
  // hand-editable on github.com, and every `Array.isArray` below is the contract.
  manifest: unknown,
  actIndex: number = ALL,
  sceneIndex: number = ALL
): ManifestLine[] {
  const acts: any[] = Array.isArray((manifest as any)?.acts) ? (manifest as any).acts : [];
  if (acts.length === 0) return [];

  // `any` on the way in: a hand-edited manifest can hold anything, which is what every
  // `Array.isArray` here is for.
  const scenesOf = (act: any): any[] => (Array.isArray(act?.scenes) ? act.scenes : []);
  const linesOf = (scene: any): ManifestLine[] =>
    Array.isArray(scene?.lines) ? scene.lines : [];

  if (isAll(actIndex)) return acts.flatMap((act) => scenesOf(act).flatMap(linesOf));

  const scenes = scenesOf(acts[clampIndex(actIndex, acts.length)]);
  if (isAll(sceneIndex) || scenes.length === 0) return scenes.flatMap(linesOf);
  return linesOf(scenes[clampIndex(sceneIndex, scenes.length)]);
}

// In RANKS and not words: the caller phrases them (`scopeText`), and a translated label
// would need a `t` and cost this module its purity. Ranks come back already bounded.
export function scopeOf(
  manifest: unknown,
  actIndex: number = ALL,
  sceneIndex: number = ALL
): Scope {
  const acts: any[] = Array.isArray((manifest as any)?.acts) ? (manifest as any).acts : [];
  if (isAll(actIndex) || acts.length === 0) return { kind: "all" };
  const ai = clampIndex(actIndex, acts.length);
  const scenes: any[] = Array.isArray(acts[ai]?.scenes) ? acts[ai].scenes : [];
  if (isAll(sceneIndex) || scenes.length === 0) return { kind: "act", actIndex: ai };
  return { kind: "scene", actIndex: ai, sceneIndex: clampIndex(sceneIndex, scenes.length) };
}

// Lines naming nobody in the cast get their own bucket. A grouping key, never displayed
// text. The parentheses keep it outside SAFE_ID, so no minted id can collide; a string and
// not a Symbol, which React refuses as a `key`; no invisible character, a NUL reads binary.
export const UNKNOWN = "(inconnu)";

// The name may be missing (the Python sanitize does not require it); the caller labels it.
const knownNames = (characters: unknown) => {
  const known = new Map<string, string | null>();
  for (const c of (Array.isArray(characters) ? characters : []) as { id?: unknown; name?: string }[]) {
    if (c && typeof c.id === "string" && c.id) known.set(c.id, c.name ?? null);
  }
  return known;
};

// ONE implementation for the counts and the block: judging "unknown" separately made
// highlighting the unknown row dim every run instead of lighting them.
const bucketOf = (line: ManifestLine, known: Map<string, string | null>) =>
  typeof line.characterId === "string" && known.has(line.characterId)
    ? line.characterId
    : UNKNOWN;

// Sorted by descending word count, so the legend follows the slices. A character silent in
// the scope is absent, or a two-character scene lists the whole cast.
export function speechStats(
  lines: unknown,
  characters?: unknown
): { rows: SpeechRow[]; totalWords: number; totalLines: number } {
  const known = knownNames(characters);

  const tally = new Map<string, SpeechRow>();
  const bump = (id: string, words: number) => {
    const row = tally.get(id) ?? { id, name: known.get(id) ?? null, words: 0, lines: 0 };
    row.words += words;
    row.lines += 1;
    tally.set(id, row);
  };

  let totalWords = 0;
  let totalLines = 0;
  for (const line of (Array.isArray(lines) ? lines : []) as ManifestLine[]) {
    if (!line || typeof line !== "object") continue;
    const words = countWords(line.text);
    bump(bucketOf(line, known), words);
    totalWords += words;
    totalLines += 1;
  }

  const rows = [...tally.values()].sort((a, b) => b.words - a.words || b.lines - a.lines);
  return { rows, totalWords, totalLines };
}

// Usable width in the hole: 63 across, but only 55 at the 15 units where the digits top.
const CENTER_WIDTH = 54;

// Measured on the UI font's digits (`tabular-nums`); letters are narrower, so it shrinks
// early rather than late.
const CHAR_WIDTH = 0.62;

// `fmt.number`'s thousands separator is not a digit: at full advance width it cost 15 % of
// the size for 6 % more text. 0.2 is measured on the comma, the widest of the three.
const THIN_CHAR = /[\s\u00a0\u202f.,]/;
const THIN_WIDTH = 0.2;

// Here and not in stats.css: this module shrinks them, and two copies drift apart.
export const TOTAL_SIZE = 17;
export const UNIT_SIZE = 9.5;

// Never larger than nominal, so only a text that is too long shrinks.
export function centerFontSize(text: string | number | null | undefined, nominal: number): number {
  const written = String(text ?? "");
  if (written.length === 0) return nominal;
  let width = 0;
  for (const char of written) width += THIN_CHAR.test(char) ? THIN_WIDTH : CHAR_WIDTH;
  return Math.min(nominal, CENTER_WIDTH / width);
}

// Words per row: a CONSTANT, never derived from the scope, so a square is the same size
// everywhere and the block's HEIGHT says the length. Bounds measured on an 820 px card: 50
// columns give a 16 px square (below, the mosaic becomes a stack of bars), 200 give 4 px
// (beyond, short runs vanish). Step of 5, landing on both bounds and the default.
export const MIN_COLUMNS = 50;
export const MAX_COLUMNS = 200;
export const DEFAULT_COLUMNS = 100;
export const COLUMNS_STEP = 5;

// `blockRects` only guards zero and negatives, so a bad value draws a breakage nobody sees.
export function clampColumns(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, n));
}

// Words laid end to end, wrapped every `columns`, cut at each row change. One rectangle per
// RUN and not per word: ~10,000 words but a few hundred runs. Empty lines produce nothing.
// `characters` feeds the same bucket as `speechStats`, which lets the legend highlight.
export function blockRects(
  lines: unknown,
  columns: unknown,
  characters?: unknown
): { rects: BlockRect[]; columns: number; rows: number; words: number } {
  const width = Math.max(1, Math.trunc(columns as number) || 1);
  const known = knownNames(characters);

  // Neighbours of the same character merge; two orphan lines merge too, being of the same
  // bucket and colour.
  const runs: { characterId: string; words: number }[] = [];
  for (const line of (Array.isArray(lines) ? lines : []) as ManifestLine[]) {
    if (!line || typeof line !== "object") continue;
    const words = countWords(line.text);
    if (words === 0) continue;
    const id = bucketOf(line, known);
    const last = runs[runs.length - 1];
    if (last && last.characterId === id) last.words += words;
    else runs.push({ characterId: id, words });
  }

  const rects: BlockRect[] = [];
  let cursor = 0; // rank in the wrapped sequence
  for (const run of runs) {
    let left = run.words;
    while (left > 0) {
      const column = cursor % width;
      const take = Math.min(left, width - column);
      rects.push({
        x: column,
        y: Math.floor(cursor / width),
        width: take,
        characterId: run.characterId,
      });
      cursor += take;
      left -= take;
    }
  }

  return { rects, columns: width, rows: Math.max(1, Math.ceil(cursor / width)), words: cursor };
}
