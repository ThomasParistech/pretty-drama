// The computation behind the Speaking share page: who speaks, how much, and when.
//
// A PURE module (no React, no DOM, no fetch), and that is deliberate: the project
// tests no React component, so everything that can go wrong must live here so that
// `node --test` replays it (cf. stats.test.js). What is left in App.jsx only draws
// what this module has counted.
//
// Three outputs, one per panel of the page: the share of the words, the share of
// the lines (the two pie charts), and the sequence of coloured runs of the
// "dialogue timeline" block.
//
// **A port of the original visualisation** (theatre_transport_de_femme repo,
// `viz/generate_viz.py`). One deliberate divergence from it:
//
//  - it MERGED the consecutive lines of one and the same character before
//    counting, so its pie chart of lines counted speaking turns and not lines.
//    Here the pie chart counts the lines of script.json, the unit the whole site
//    uses (statuses, clips, the rail's counts). The merge serves the block ONLY,
//    where two neighbouring lines of the same character would give two rectangles
//    of the same colour stuck together.
//
// The block's width, on the other hand, is FIXED as it was there (cf.
// `DEFAULT_COLUMNS`): derived for a while from the number of words in the scope, it
// gave squares of different sizes from one scene to the next, hence blocks that
// could not be compared.

// The number of words in a text. Same splitting as the reference's
// `re.findall(r'\w+')`: apostrophes separate, so "l'crâne" counts as two words.
// That inflates the totals a little in absolute terms, but the page only displays
// PROPORTIONS, and it is the same inflation for everyone; in exchange the site's
// figures and those of the troupe's PDF agree.
//
// Tolerant by contract: the manifest may be hand-edited, a line without text counts
// zero and does not crash the page.
export function countWords(text) {
  if (typeof text !== "string") return 0;
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

// ---------------------------------------------------------------- the scope

// The "whole play" and "whole act" scopes, as the header's selects offer them. A
// rank of -1 means "all of this level".
export const ALL = -1;

// Anything that is not a usable rank means "all of this level", and not -1 alone:
// without that, -1 returned the whole play whereas -5 silently fell back on the
// first scene, and a NaN (a `Number("")` coming from a select) returned nothing at
// all.
const isAll = (index) => !Number.isInteger(index) || index < 0;

// A rank brought back within the list's bounds, never an optimistic access: a
// manifest reloaded under a rank that has become too large would return `undefined`,
// and the page would read as empty instead of falling back on an existing scene
// (an idiom from src/editor/App.jsx).
const clampIndex = (index, length) => Math.max(0, Math.min(index, length - 1));

// The lines of the chosen scope, in the play's order. That order is the only
// information the block carries beyond the colours: it is a timeline.
export function scopeLines(manifest, actIndex = ALL, sceneIndex = ALL) {
  const acts = Array.isArray(manifest?.acts) ? manifest.acts : [];
  if (acts.length === 0) return [];

  const scenesOf = (act) => (Array.isArray(act?.scenes) ? act.scenes : []);
  const linesOf = (scene) => (Array.isArray(scene?.lines) ? scene.lines : []);

  if (isAll(actIndex)) return acts.flatMap((act) => scenesOf(act).flatMap(linesOf));

  const scenes = scenesOf(acts[clampIndex(actIndex, acts.length)]);
  if (isAll(sceneIndex) || scenes.length === 0) return scenes.flatMap(linesOf);
  return linesOf(scenes[clampIndex(sceneIndex, scenes.length)]);
}

// The chosen scope, in RANKS and not in words: the three panels and the two pie
// charts always name it the same way, but it is the caller that puts it into a
// sentence, with the reader's locale (cf. `scopeText` in App.jsx and
// src/shared/structureLabels.js).
//
// Two things fall away with this change. Acts and scenes no longer have a title, so
// there is nothing left to copy over and no elided fallback ("the act", "the scene")
// to carry here. And this module stays PURE: a translated label would require a `t`,
// whereas a rank requires nothing, which keeps `stats.test.js` under `node --test`.
//
// `kind` says which level one is on, and the ranks are already bounded: the caller
// no longer has to re-check that an act exists.
export function scopeOf(manifest, actIndex = ALL, sceneIndex = ALL) {
  const acts = Array.isArray(manifest?.acts) ? manifest.acts : [];
  if (isAll(actIndex) || acts.length === 0) return { kind: "all" };
  const ai = clampIndex(actIndex, acts.length);
  const scenes = Array.isArray(acts[ai]?.scenes) ? acts[ai].scenes : [];
  if (isAll(sceneIndex) || scenes.length === 0) return { kind: "act", actIndex: ai };
  return { kind: "scene", actIndex: ai, sceneIndex: clampIndex(sceneIndex, scenes.length) };
}

// ------------------------------------------------------------- the counts

// Unknown character: a null `characterId`, or one that designates no character of
// the cast. These lines do exist (a hand-edited script, a character deleted in a
// file taken up by hand) and they are NOT silently melted into the total, following
// the precedent of the Progress page's grid: they get their own row, apart, under a
// label that says what they are.
//
// It is a BUCKET, not an id: it serves as a grouping key and as a comparison value
// (`row.id`, `rect.characterId`, the highlighted character), never as displayed
// text, the label of its row being set by the caller (`nameOf`). The parentheses
// keep it outside `SAFE_ID` (`^[0-9a-zA-Z-]{1,64}$`), so no id minted by the editor
// can look like it. It stays a string and not a `Symbol`, which would make the
// collision impossible but which React refuses: `key={row.id}` on a Symbol raises
// "Cannot convert a Symbol value to a string". And above all no invisible character
// inside it: a NUL in the source makes the whole file pass for a binary in git's
// eyes, which then never shows its diff again.
export const UNKNOWN = "(inconnu)";

// The cast, by id. The name may be missing (the Python sanitize does not require
// it), and it is the caller that sets the fallback label.
const knownNames = (characters) => {
  const known = new Map();
  for (const c of Array.isArray(characters) ? characters : []) {
    if (c && typeof c.id === "string" && c.id) known.set(c.id, c.name);
  }
  return known;
};

// A line's bucket: its character, or UNKNOWN. **A single implementation**, shared
// by the counts and by the block, and it is what keeps them in agreement: when each
// judged "unknown" in its own way (the counts against the cast, the block on the
// shape of the `characterId` alone), highlighting "Unknown character" in the block's
// legend compared a bucket to a raw id, hence dimmed ALL the runs, including the
// ones just asked for.
const bucketOf = (line, known) =>
  typeof line.characterId === "string" && known.has(line.characterId)
    ? line.characterId
    : UNKNOWN;

// The share of the words and of the lines over the scope.
//
// `rows` is sorted by descending word count, like the reference's pie charts
// (`argsort` on the counts): the pie chart reads from the most talkative to the
// least, and the legend follows the same order as the slices. A character without
// any line in the scope does not appear in it at all, otherwise the legend of a
// two-character scene would list the entire cast.
export function speechStats(lines, characters) {
  const known = knownNames(characters);

  const tally = new Map();
  const bump = (id, words) => {
    const row = tally.get(id) ?? { id, name: known.get(id) ?? null, words: 0, lines: 0 };
    row.words += words;
    row.lines += 1;
    tally.set(id, row);
  };

  let totalWords = 0;
  let totalLines = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line !== "object") continue;
    const words = countWords(line.text);
    bump(bucketOf(line, known), words);
    totalWords += words;
    totalLines += 1;
  }

  const rows = [...tally.values()].sort((a, b) => b.words - a.words || b.lines - a.lines);
  return { rows, totalWords, totalLines };
}

// ------------------------------------------------------ the centre of the ring

// The total and its unit are written INSIDE the ring's hole, in viewBox units
// (100 x 100), so their size must depend on what is written: at a fixed size, a
// troupe whose play goes beyond 99,999 words pushes its total below the ring, and
// the longest unit ("lines") already touches its edges. The hole measures 63 units
// across (radius 38, stroke of 13), but a text placed above the centre never has
// the diameter to itself: 15 units away from the centre, where the top of the
// digits runs, the chord is only 55. So 54 is what can be promised to the two
// lines.
const CENTER_WIDTH = 54;

// The average advance width of a character, as a fraction of the font size. 0.62
// is measured on the digits of the UI font, rendered in `tabular-nums` hence all
// of the same width; the lowercase letters of the unit are narrower, and the
// margin plays in the right direction (we shrink a little too early, never too
// late).
const CHAR_WIDTH = 0.62;

// The thousands separator does NOT count as a digit. Since the total goes through
// `fmt.number`, the centre line carries a narrow no-break space in French
// ("10 307") and a comma in English ("10,307"): at full advance width, those
// characters brought the published play's total down from 17 to 14.5 units, a 15 %
// shrink for a line that only grows 6 % wider. That is the sole reason why this
// computation looks at what is IN the string instead of counting its characters.
// 0.2 is an upper bound measured on the comma, the widest of the three, so the
// margin always plays in the right direction (we shrink a little too early, never
// too late).
const THIN_CHAR = /[\s\u00a0\u202f.,]/;
const THIN_WIDTH = 0.2;

// The two nominal sizes, the ones at which the two lines are drawn when they fit.
// They live here and not in stats.css because it is this module that decides to
// reduce them: the same figure written in both places would fall out of agreement
// at the first adjustment.
export const TOTAL_SIZE = 17;
export const UNIT_SIZE = 9.5;

// The size at which `text` fits inside the ring's hole, never larger than its
// nominal size: today's numbers and units are therefore rendered exactly as
// before, and only a text that is too long shrinks.
export function centerFontSize(text, nominal) {
  const written = String(text ?? "");
  if (written.length === 0) return nominal;
  let width = 0;
  for (const char of written) width += THIN_CHAR.test(char) ? THIN_WIDTH : CHAR_WIDTH;
  return Math.min(nominal, CENTER_WIDTH / width);
}

// ------------------------------------------------------------------- the block

// The number of words per row of the block: **a constant, and a setting.**
//
// It is NO LONGER derived from the number of words in the scope. That derived width
// gave every scene a flattering shape, twice as wide as it was tall, but at the cost
// of a square that changed size from one scope to the next, hence of two blocks that
// could not be compared: a 300-word scene and the whole play filled the same card,
// and nothing said which one was long. At a constant number of words per row, a
// square is the same size everywhere and the block's HEIGHT says the length. That is
// moreover what the Python reference did (`generate_viz.py`: `w=50` per scene,
// `w=100` for the play): we come back to it, with the difference that there is now
// only one figure, the same for every scope. The derived shape was even in there, as
// a commented-out line right above (`# h = w = math.ceil(math.sqrt(count_words))`):
// it had given it up.
//
// It is adjustable, because a troupe does not have this one's play: a figure that
// suits 10,000 words gives a two-row ribbon on a play of 500 and a wall several
// screens tall on a play of 30,000.
//
// **100 by default, the reference's value** (`generate_viz.py`: `w=100` for
// `all_image.svg`, `w=50` per scene): it is the same document as the troupe's PDF,
// served on screen, so its block reads at the width they have always read it at. It
// falls out nicely besides: 100 columns in an 820 px card give 800 px of block and a
// square of exactly 8 px, that is 103 rows for the whole play. 120 was the default
// for a while, but that was only the ceiling of the old derived formula, a figure
// without an origin.
//
// The floor of 50 comes from the reference too, it is its PER-SCENE width: the only
// two values it used are therefore the default and the lower bound, and the range
// merely extends them.
//
// The two bounds otherwise rest on a single piece of arithmetic, a square's side =
// the card's usable width / the number of columns. On the widest layout, 820 px: 50
// columns give a side of 16 px, 200 give 4. Below 50,
// the block stops being a mosaic and becomes a stack of bars (a side of 34 px at 24
// columns, the previous floor) and an average line occupies several rows, so the
// alternation of the voices can no longer be read. Beyond 200, the short runs start
// disappearing: that is already a block of 52 rows for the whole play, and on a phone
// (a 238 px card) the square goes down to 1 px there, so the top of the range is a
// desktop setting. A ceiling of 250 was tried and removed, the range ceasing to be of
// any use well before that.
//
// The step of 5 serves the dragging (at 1, a keyboard arrow moves the block by one
// word per row, which cannot be seen) and it falls exactly on the three figures that
// matter, the two bounds and the default: a value off the step's grid would make the
// first press on an arrow jump.
export const MIN_COLUMNS = 50;
export const MAX_COLUMNS = 200;
export const DEFAULT_COLUMNS = 100;
export const COLUMNS_STEP = 5;

// The setting brought back within its bounds. The slider cannot go outside them, but
// it is what feeds the drawing's viewBox, and `blockRects` only defends against zero
// and negatives: an out-of-bounds value would make an unreadable block rather than an
// error, which is exactly the kind of breakage nobody notices.
export function clampColumns(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, n));
}

// The block's runs: the words of the scope laid end to end, wrapped every `columns`
// words, cut at every change of row.
//
// One rectangle per run and not one per word: the whole play is close to 10,000
// words, hence that many SVG elements, whereas the runs are counted in hundreds (one
// per line, plus one cut per row crossed). The consecutive lines of one and the same
// character are merged first: they would be adjacent and of the same colour.
//
// A line without a word (empty text) occupies no square, hence produces nothing. The
// last row stays incomplete, like the reference's `NaN`s.
//
// `characters` serves the same bucket as `speechStats` (cf. `bucketOf`): the runs
// therefore carry the identities the legend displays, and that is what makes it
// possible to highlight one of them. Without the cast, the block would not be able to
// tell a deleted character from a character of the play.
export function blockRects(lines, columns, characters) {
  const width = Math.max(1, Math.trunc(columns) || 1);
  const known = knownNames(characters);

  // Merging the neighbours of the same character. Two neighbouring orphan lines
  // therefore merge too, even under different `characterId`s: they are of the same
  // bucket and of the same colour, hence two runs stuck together instead of one.
  const runs = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line !== "object") continue;
    const words = countWords(line.text);
    if (words === 0) continue;
    const id = bucketOf(line, known);
    const last = runs[runs.length - 1];
    if (last && last.characterId === id) last.words += words;
    else runs.push({ characterId: id, words });
  }

  const rects = [];
  let cursor = 0; // rank of the current word in the wrapped sequence
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
