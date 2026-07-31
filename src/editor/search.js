// Search and replace in the play's lines, for the editor.
// A PURE module: no React, no DOM, no reducer. This is where everything hard lives,
// therefore everything `node --test` can check (see search.test.js).
//
// **The central contract: folding preserves length.**
// `foldText(raw).length === raw.length`, always. An index into the folded text is
// therefore an index into the RAW text, the textarea's, and a match's offsets are
// used directly for `setSelectionRange` and for slicing the replacement. Without that
// contract an index map per line would be needed; with it, there is no offset
// arithmetic anywhere else.
//
// **This is not the project's normalisation.** `scripts/normalize.py` remains the
// only implementation of the normalisation (an invariant of CLAUDE.md): it serves to
// compare a line with the text of a recording, and its result travels all the way to
// the manifest. The folding here serves ONLY to find a match on screen: it is neither
// stored, nor transported, nor compared with a clip, and it lives for the duration of
// one render.
//
// **No regular expression is built from the query.** The matching is an `indexOf`;
// the file's only two RegExp are literals applied to the TEXT. So nothing to escape,
// no "invalid expression" state to display, no catastrophic backtracking. That is
// also why "Whole word" is a boundary test and not a `\b`.
//
// **Accepted limits of the folding** (none of them exists on a French keyboard, and
// the published play contains none): ligatures and letters with no canonical
// decomposition (`œ`, `æ`, `ﬁ`) do not unfold, so "oeuvre" does not find "œuvre";
// `İ` keeps its form; and a text already stored in NFD (accent as a separate code
// point) yields no match at all on the accented letter rather than half a match (see
// `cutsGrapheme`). The only remedy would be a folded-index -> raw-index map per line,
// that is one array per line: that is why it is not there.

// Combining marks: what NFD separates from its letter.
// Written as escapes and not as characters: inside brackets, two literal combining
// marks land on the opening bracket and the class becomes unreadable in half the
// editors out there.
const COMBINING_G = /[\u0300-\u036f]/g; // for .replace
// The same one, without the global flag: `.test` on a global RegExp is a trap (it
// advances `lastIndex`), so every other call would answer wrongly.
const COMBINING = /[\u0300-\u036f]/;

// Typographic apostrophes and dashes brought back to their keyboard-typed form, ONE
// character for ONE. This is not a refinement: the published play carries the curly
// apostrophe on 253 lines and the straight one on 324, within the SAME play (part of
// it was typed elsewhere). Without this table, searching for "l'amour" only finds half
// of them, with nothing on screen to explain it.
const UNIFY = {
  "’": "'",
  "‘": "'",
  "ʼ": "'",
  "–": "-",
  "—": "-",
};

// A word character, for "Whole word": a Unicode letter or digit.
// Neither "_", nor "'", nor "-", on purpose: in a play, "vous" is a whole word in
// "mettez-vous" and "homme" a whole word in "l'homme".
const WORD = /[\p{L}\p{N}]/u;

/**
 * Folds a text for comparison, PRESERVING ITS LENGTH.
 *
 * The loop walks the code points (`for...of`) and never the UTF-16 units: a surrogate
 * pair (emoji) is therefore never cut in two. Every candidate transformation is
 * refused if it is not the same length as its source; in that case the raw character
 * is kept. We lose insensitivity on it, we NEVER lose the alignment of the offsets.
 *
 * NFD and not NFKD: canonical decomposition only produces "base + marks", so the
 * length test almost always passes; NFKD would break `ﬁ` into `fi` and would refuse
 * more characters for nothing in French.
 */
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
    // A precomposed "é" unfolds into "e" (1 for 1): accepted. A lone combining mark
    // would disappear (1 for 0): refused, it stays.
    if (stripped.length === folded.length) folded = stripped;
    out += folded.length === ch.length ? folded : ch;
  }
  return out;
}

// Folding memo, key = the line OBJECT. Folding the whole play costs a few
// milliseconds (a thousand lines, fifty thousand characters) and the scan that
// follows a few tens of microseconds: without a memo, every keystroke would pay for
// the whole folding again. A keystroke only changes the identity of the edited line,
// so only one is folded again.
//
// This cache is correct ONLY because the reducer is immutable: a line object never
// sees its text change under it, it is replaced. A Map keyed by text, on the other
// hand, would grow by one entry on every keystroke; a WeakMap keyed by object lets go
// of everything the undo stack forgets.
const foldCache = new WeakMap(); // line -> [insensitive, sensitive]

function foldLine(line, caseSensitive) {
  let pair = foldCache.get(line);
  if (!pair) foldCache.set(line, (pair = [null, null]));
  const slot = caseSensitive ? 1 : 0;
  if (pair[slot] === null) pair[slot] = foldText(line.text, caseSensitive);
  return pair[slot];
}

const isWordAt = (s, i) => i >= 0 && i < s.length && WORD.test(s[i]);

// Refuses a match one of whose edges falls on a combining mark: in a text stored in
// NFD, searching for "e" would land on the "e" of a decomposed "é", and the
// replacement would leave the accent orphaned, stuck to the word next door. No match
// at all rather than a false one.
const cutsGrapheme = (s, start, end) =>
  COMBINING.test(s[start] ?? "") || COMBINING.test(s[end] ?? "");

/**
 * Walks the matches of `foldedQuery` in `folded`, in order and without overlap,
 * calling `visit(start, end)` for each of them.
 *
 * **The module's ONE AND ONLY iterator**: the search, the replacement of a single
 * match and the global replacement all three share it. Without this, "Replace all"
 * could rewrite something the list never showed, and nobody would notice before
 * rereading the play.
 */
function eachMatch(folded, foldedQuery, wholeWord, visit) {
  const n = foldedQuery.length;
  // `"".indexOf("")` returns 0: without this guard, an empty query loops forever.
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
      // Accepted: we restart AFTER it, matches do not overlap (like VSCode).
      from = end;
    } else {
      // Refused: ONE notch further on, and not the length of the query, otherwise
      // "aa" in "aaa aa" would lose the second match.
      from = start + 1;
    }
  }
}

/**
 * All the matches in the play, flat and grouped by scene.
 *
 * Returns `{ matches, total, groups }`:
 *  - `matches` is the authority for previous/next (reading order);
 *  - `groups` is `[{ actIndex, sceneIndex, matches }]` (RANKS: an act and a scene
 *    have no title, it is the panel that derives their label, see
 *    src/shared/structureLabels.js)
 *    and shares THE SAME objects: the panel and the navigation cannot fall out of
 *    step about what the current match is.
 *
 * A match does NOT carry its excerpt: a single-character query yields several
 * thousand of them on a real play, and the panel only renders a handful. The excerpts
 * are built at display time (`matchExcerpt`).
 */
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
            // Rank of the line within the whole play: the anchor's ordering key (see
            // useSearch), which must survive a change of query, and therefore cannot
            // be a match rank.
            lineOrdinal: ordinal,
            lineId: line.id,
            // The id and not the name: the panel resolves it the same way the line
            // rows do (`characterColor`, src/shared/characterColors.js), and a name
            // copied out here would fall out of step with a rename.
            characterId: line.characterId,
            // A reference to the existing text, zero copies.
            text: line.text,
            start,
            end,
          };
          matches.push(match);
          if (group === null) {
            // The ranks alone: an act and a scene no longer have a title, their label
            // is derived from the rank at render time (structureLabels.js), so it is
            // the panel that puts them into words, and in the language of the PLAY,
            // like the rest of the editor. This module thus stays without a single
            // word of any language, hence pure and testable without a DOM.
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

// What we keep on either side of the match, and it is not symmetrical. The result row
// is TWO lines of text, no more (fixed height, see `.search-hits > li` in editor.css),
// so the excerpt has to fit in two lines AND guarantee that the match is part of them:
// what precedes it is therefore capped at roughly one line, and the rest goes to what
// follows it, because one reads forwards and because the rest of the sentence says
// more about the line than its beginning does.
export const EXCERPT_BEFORE = 34;
export const EXCERPT_AFTER = 64;

/**
 * An excerpt CENTRED on the match, in three pieces ready to render: the panel writes
 * `{before}<mark>{hit}</mark>{after}` without ever touching an offset.
 *
 * Not `excerpt()` from shared/data.js, which truncates from the BEGINNING: that one
 * remains right for quoting a line in a ConfirmModal, but a match at the six hundredth
 * character of a speech would not show up in it.
 *
 * Whitespace is flattened because a line may contain newlines (Shift + Enter): that is
 * display, the raw text is not touched.
 */
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

// Rewrites a text from the matches computed on ITS ORIGINAL VERSION, consumed from
// left to right. Never a new search inside the result: that is what makes a
// replacement containing the query harmless ("a" -> "aa" doubles the text and stops,
// it does not run away).
function replaceFolded(text, folded, foldedQuery, wholeWord, replacement) {
  let out = "";
  let cursor = 0;
  eachMatch(folded, foldedQuery, wholeWord, (start, end) => {
    out += text.slice(cursor, start) + replacement;
    cursor = end;
  });
  // No match: we return the string we RECEIVED, not a copy. The reducer depends on
  // that to keep the line's identity (see applyTextEdits).
  if (cursor === 0) return text;
  out += text.slice(cursor);
  return out === text ? text : out;
}

/**
 * Replaces every match within ONE text. Returns the text it received identically when
 * nothing changes.
 *
 * Accepted consequence of an insensitive replacement: it rewrites the typography.
 * Replacing "l'amour" in a line with a curly apostrophe writes a straight apostrophe;
 * replacing "eleve" with "ELEVE" loses the accents of "élève". VSCode does exactly the
 * same with case, and the alternative (replaying the source's case and accents onto the
 * replacement) would guess in the user's stead. It is tested, so nobody will "fix" it
 * by surprise.
 */
export function replaceInText(text, query, options = {}, replacement = "") {
  const { caseSensitive = false, wholeWord = false } = options;
  const foldedQuery = foldText(query, caseSensitive);
  if (foldedQuery.length === 0) return text;
  return replaceFolded(text, foldText(text, caseSensitive), foldedQuery, wholeWord, replacement);
}

/**
 * The batch of edits of a "Replace all": one entry per line ACTUALLY changed, nothing
 * for the others.
 *
 * Makes its own pass over the play rather than consuming the displayed array of
 * matches: the panel caps what it renders, and a display ceiling must never decide
 * what gets written. The same iterator on both sides, so the announced count and the
 * rewritten count cannot differ.
 */
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

/**
 * Replaces ONE designated match: offset arithmetic, not a new search.
 *
 * `nextStart` places the anchor just after what has been written, so that "next" lands
 * on the following match and never on the replacement itself (which may contain the
 * query).
 */
export function replaceOneEdit(match, replacement = "") {
  return {
    lineId: match.lineId,
    text: match.text.slice(0, match.start) + replacement + match.text.slice(match.end),
    nextStart: match.start + replacement.length,
  };
}
