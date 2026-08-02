// Search and replace in the play's lines. PURE module, covered by `node --test`.
// CENTRAL CONTRACT: folding PRESERVES LENGTH, so an index into the folded text is an
// index into the raw text and there is no offset arithmetic anywhere else.
// NOT the project's normalisation (scripts/normalize.py): this folding is never
// stored, transported or compared with a clip.
// No RegExp is built from the query, only `indexOf`: nothing to escape, no invalid
// expression, no backtracking. Hence "Whole word" is a boundary test and not `\b`.
// Accepted limits: ligatures with no canonical decomposition (`œ`, `ﬁ`) do not unfold,
// and text stored in NFD yields no match rather than half a one (see `cutsGrapheme`).

// Combining marks, as escapes: two literal ones inside brackets land on the bracket.
const COMBINING_G = /[\u0300-\u036f]/g; // for .replace
// Same without /g: `.test` on a global RegExp advances `lastIndex`.
const COMBINING = /[\u0300-\u036f]/;

// Typographic apostrophes and dashes, ONE character for ONE. Not a refinement: the
// published play carries 253 curly apostrophes and 324 straight ones, so "l'amour"
// otherwise finds half of them with nothing on screen to explain it.
const UNIFY = {
  "’": "'",
  "‘": "'",
  "ʼ": "'",
  "–": "-",
  "—": "-",
};

// Word character for "Whole word". Neither "_", "'" nor "-": "vous" is a whole word
// in "mettez-vous" and "homme" in "l'homme".
const WORD = /[\p{L}\p{N}]/u;

// Folds a text PRESERVING ITS LENGTH: `for...of` walks code points so a surrogate pair
// is never cut, and any transformation that changes the length is refused. Insensitivity
// is what gets lost, never the alignment of the offsets.
// NFD and not NFKD, which would break `ﬁ` into `fi` and refuse more for nothing.
export function foldText(raw, caseSensitive = false) {
  let out = "";
  for (const ch of raw) {
    let folded = UNIFY[ch] ?? ch;
    if (!caseSensitive) {
      const lower = folded.toLowerCase();
      // "İ" lowercased makes two units: refused.
      if (lower.length === folded.length) folded = lower;
    }
    const stripped = folded.normalize("NFD").replace(COMBINING_G, "");
    // "é" unfolds to "e" (1 for 1): accepted. A lone combining mark would vanish.
    if (stripped.length === folded.length) folded = stripped;
    out += folded.length === ch.length ? folded : ch;
  }
  return out;
}

// Keyed by the line OBJECT: correct ONLY because the reducer is immutable, a line's
// text never changes under it. A keystroke changes one line's identity, so one line is
// folded again. A WeakMap so it lets go of what the undo stack forgets.
const foldCache = new WeakMap(); // line -> [insensitive, sensitive]

function foldLine(line, caseSensitive) {
  let pair = foldCache.get(line);
  if (!pair) foldCache.set(line, (pair = [null, null]));
  const slot = caseSensitive ? 1 : 0;
  if (pair[slot] === null) pair[slot] = foldText(line.text, caseSensitive);
  return pair[slot];
}

const isWordAt = (s, i) => i >= 0 && i < s.length && WORD.test(s[i]);

// Refuses a match whose edge falls on a combining mark: in NFD text, "e" would match
// the "e" of a decomposed "é" and the replacement would orphan the accent.
const cutsGrapheme = (s, start, end) =>
  COMBINING.test(s[start] ?? "") || COMBINING.test(s[end] ?? "");

// The module's ONE AND ONLY iterator, shared by the search and both replacements:
// otherwise "Replace all" could rewrite something the list never showed.
function eachMatch(folded, foldedQuery, wholeWord, visit) {
  const n = foldedQuery.length;
  // `"".indexOf("")` returns 0: an empty query would loop forever.
  if (n === 0) return;
  let from = 0;
  for (;;) {
    const start = folded.indexOf(foldedQuery, from);
    if (start === -1) return;
    const end = start + n;
    const ok =
      !cutsGrapheme(folded, start, end) &&
      (!wholeWord || (!isWordAt(folded, start - 1) && !isWordAt(folded, end)));
    if (ok) {
      visit(start, end);
      // Matches do not overlap, like VSCode.
      from = end;
    } else {
      // ONE notch on, not the query's length, or "aa" in "aaa aa" loses a match.
      from = start + 1;
    }
  }
}

// All the matches, flat (`matches`, the authority for previous/next) and grouped by
// scene, sharing THE SAME objects so panel and navigation cannot disagree on what the
// current match is. Groups carry RANKS: the panel derives the labels.
// A match carries no excerpt: one character yields thousands, the panel renders a few.
export function searchScript(script, query, options = {}) {
  const { caseSensitive = false, wholeWord = false } = options;
  const foldedQuery = foldText(query, caseSensitive);
  const matches = [];
  const groups = [];
  if (foldedQuery.length === 0) return { matches, total: 0, groups };

  let lineOrdinal = 0;
  script.acts.forEach((act, actIndex) => {
    act.scenes.forEach((scene, sceneIndex) => {
      let group = null;
      for (const line of scene.lines) {
        const ordinal = lineOrdinal++;
        eachMatch(foldLine(line, caseSensitive), foldedQuery, wholeWord, (start, end) => {
          const match = {
            index: matches.length,
            actIndex,
            sceneIndex,
            // The anchor's ordering key (useSearch): it survives a change of query,
            // which a match rank does not.
            lineOrdinal: ordinal,
            lineId: line.id,
            // The id and not the name, which would drift on a rename.
            characterId: line.characterId,
            text: line.text,
            start,
            end,
          };
          matches.push(match);
          if (group === null) {
            // Ranks alone, so this module holds no word of any language.
            group = { actIndex, sceneIndex, matches: [] };
            groups.push(group);
          }
          group.matches.push(match);
        });
      }
    });
  });
  return { matches, total: matches.length, groups };
}

// Asymmetric on purpose: a result row is exactly two lines tall, so what precedes the
// match gets about one line and the rest goes after it, which is where one reads.
export const EXCERPT_BEFORE = 34;
export const EXCERPT_AFTER = 64;

// An excerpt CENTRED on the match, in three pieces, so the panel touches no offset.
// Not `excerpt()` (shared/data.js), which truncates from the BEGINNING and would not
// show a match at the six hundredth character. Whitespace is flattened for display.
export function matchExcerpt(match, before = EXCERPT_BEFORE, after = EXCERPT_AFTER) {
  const flat = (s) => s.replace(/\s+/g, " ");
  const from = Math.max(0, match.start - before);
  const to = Math.min(match.text.length, match.end + after);
  return {
    before: (from > 0 ? "…" : "") + flat(match.text.slice(from, match.start)),
    hit: flat(match.text.slice(match.start, match.end)),
    after: flat(match.text.slice(match.end, to)) + (to < match.text.length ? "…" : ""),
  };
}

// Rewrites from the matches of the ORIGINAL text, left to right. Never a new search in
// the result, which is what keeps "a" -> "aa" from running away.
function replaceFolded(text, folded, foldedQuery, wholeWord, replacement) {
  let out = "";
  let cursor = 0;
  eachMatch(folded, foldedQuery, wholeWord, (start, end) => {
    out += text.slice(cursor, start) + replacement;
    cursor = end;
  });
  // Returns the string RECEIVED, not a copy: applyTextEdits keeps the line's identity.
  if (cursor === 0) return text;
  out += text.slice(cursor);
  return out === text ? text : out;
}

// Replaces every match in ONE text, returning it identically when nothing changes.
// Accepted: an insensitive replacement REWRITES the typography (a curly apostrophe
// becomes straight, "eleve" -> "ELEVE" loses the accents of "élève"). VSCode does the
// same, and replaying the source's case would guess for the user. Tested, so do not
// "fix" it.
export function replaceInText(text, query, options = {}, replacement = "") {
  const { caseSensitive = false, wholeWord = false } = options;
  const foldedQuery = foldText(query, caseSensitive);
  if (foldedQuery.length === 0) return text;
  return replaceFolded(text, foldText(text, caseSensitive), foldedQuery, wholeWord, replacement);
}

// One entry per line ACTUALLY changed. Its own pass over the play and not the displayed
// matches: a display ceiling must never decide what gets written.
export function buildReplaceEdits(script, query, options = {}, replacement = "") {
  const { caseSensitive = false, wholeWord = false } = options;
  const foldedQuery = foldText(query, caseSensitive);
  const edits = [];
  if (foldedQuery.length === 0) return edits;
  for (const act of script.acts) {
    for (const scene of act.scenes) {
      for (const line of scene.lines) {
        const text = replaceFolded(
          line.text,
          foldLine(line, caseSensitive),
          foldedQuery,
          wholeWord,
          replacement
        );
        if (text !== line.text) edits.push({ lineId: line.id, text });
      }
    }
  }
  return edits;
}

// Offset arithmetic, not a new search. `nextStart` puts the anchor past what was
// written, so "next" cannot land on a replacement containing the query.
export function replaceOneEdit(match, replacement = "") {
  return {
    lineId: match.lineId,
    text: match.text.slice(0, match.start) + replacement + match.text.slice(match.end),
    nextStart: match.start + replacement.length,
  };
}
