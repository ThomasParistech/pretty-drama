// Tests for the editor's search and replace (search.js).
//
// This is pure logic, with no React and no DOM: `node --test` runs it as is. And
// it is the most useful file of the lot, because everything that is hard in this
// feature is invisible to the eye: an offset that slips by one when the word
// carries an accent, a match lost next to a rejected match, a replacement that
// contains the query and doubles the text, a displayed count that does not match
// what will be rewritten.
//
// The invariant everything else depends on is the first test: folding preserves
// length, so an index in the folded text is an index in the raw text. It is
// checked against a TABLE and not against one example.
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXCERPT_AFTER,
  EXCERPT_BEFORE,
  buildReplaceEdits,
  foldText,
  matchExcerpt,
  replaceInText,
  replaceOneEdit,
  searchScript,
} from "./search.js";

// Two acts, on purpose: reading order and grouping by scene cannot be checked on
// a single act. The two spellings of the apostrophe live side by side, as in the
// real play.
const play = () => ({
  title: "Le Misanthrope",
  characters: [
    { id: "c-alceste", name: "Alceste", color: "#1f77b4" },
    { id: "c-philinte", name: "Philinte", color: "#ff7f0e" },
  ],
  acts: [
    {
      scenes: [
        {
          lines: [
            { id: "l-1", characterId: "c-alceste", text: "Cet élève m'écoute." },
            { id: "l-2", characterId: "c-philinte", text: "L’élève ? Quel élève ?" },
          ],
        },
        {
          lines: [{ id: "l-3", characterId: "c-alceste", text: "Rien ici." }],
        },
      ],
    },
    {
      scenes: [
        {
          lines: [
            { id: "l-4", characterId: "c-philinte", text: "Un dernier élève." },
            { id: "l-5", characterId: "c-alceste", text: "L'élève écoute." },
          ],
        },
      ],
    },
  ],
});

// A play with a single line: boundary cases read better on the text alone than
// drowned in an extract from Le Misanthrope.
const one = (text) => ({
  title: "Essai",
  characters: [],
  acts: [{ scenes: [{ lines: [{ id: "l", characterId: null, text }] }] }],
});

const startsOf = (script, query, options) =>
  searchScript(script, query, options).matches.map((m) => m.start);
const countIn = (script, query, options) => searchScript(script, query, options).total;

// --------------------------------------------------------------- folding

test("folding preserves length, character by character", () => {
  // Each of these strings breaks a naive assumption: a lowercase form that grows
  // (İ), a letter with no canonical decomposition (Æ, ß, ﬁ), a surrogate pair
  // (emoji), an accent already separated from its letter, a curly apostrophe.
  const table = [
    "École",
    "Æsop",
    "İstanbul",
    "straße",
    "ﬁn",
    "🎭 masque",
    "école",
    "l’amour",
    "MÈRE",
    "",
  ];
  for (const s of table) {
    for (const caseSensitive of [false, true]) {
      assert.equal(
        foldText(s, caseSensitive).length,
        s.length,
        `"${s}", case ${caseSensitive ? "respected" : "ignored"}`
      );
    }
  }
});

test("a search without accents finds the accented word, at the offsets of the RAW text", () => {
  const { matches } = searchScript(one("Cet élève m'écoute."), "eleve");
  assert.equal(matches.length, 1);
  const m = matches[0];
  // The real test is not "there is a match" but "its offsets cut out the right
  // piece of the original text".
  assert.equal(m.text.slice(m.start, m.end), "élève");
});

test("a match is always the length of the query", () => {
  const { matches } = searchScript(one("Cet élève."), "eleve");
  assert.equal(matches[0].end - matches[0].start, "eleve".length);
});

test("the straight apostrophe and the curly one find each other", () => {
  const courbe = searchScript(one("L’élève écoute."), "l'eleve").matches[0];
  assert.equal(courbe.text.slice(courbe.start, courbe.end), "L’élève");

  const droite = searchScript(one("L'élève écoute."), "l’eleve").matches[0];
  assert.equal(droite.text.slice(droite.start, droite.end), "L'élève");
});

test("an accent in a separate code point gives no half match", () => {
  // "école" written as e + U+0301: searching for "e" must not land on the "e"
  // that carries the accent (replacing it would leave the mark orphaned). The
  // final "e" of the word, on the other hand, is a legitimate match.
  assert.deepEqual(startsOf(one("école"), "e"), [5]);
});

// ------------------------------------------------------------------ options

test("by default case and accents are ignored", () => {
  assert.equal(countIn(play(), "ELEVE"), 5);
});

test("Match case still ignores accents", () => {
  // There is no third checkbox: "eleve" goes on finding "élève", only the case
  // becomes demanding.
  assert.equal(countIn(play(), "eleve", { caseSensitive: true }), 5);
  assert.equal(countIn(play(), "Eleve", { caseSensitive: true }), 0);
});

test("Whole word stops at word boundaries, not at apostrophes or hyphens", () => {
  const opts = { wholeWord: true };
  assert.equal(countIn(one("un mot et des mots"), "mot", opts), 1);
  // "vous" is a whole word in "mettez-vous", "homme" in "l'homme".
  assert.equal(countIn(one("mettez-vous là"), "vous", opts), 1);
  assert.equal(countIn(one("l'homme"), "homme", opts), 1);
});

test("Whole word rejects a match glued to a word", () => {
  assert.deepEqual(startsOf(one("aaa aa"), "aa", { wholeWord: true }), [4]);
});

test("Whole word does not lose a match overlapping a rejected match", () => {
  // The trap of the advance step. "a a" has two overlapping matches, at indexes 1
  // and 3: the first is rejected (glued to the "x"), the second is a whole word.
  // After a REJECTED candidate one must therefore restart ONE step along;
  // restarting by the length of the query would jump over the good one and the
  // list would show nothing.
  assert.deepEqual(startsOf(one("xa a a"), "a a", { wholeWord: true }), [3]);
});

// ------------------------------------------------------------ shape of the scan

test("an empty query finds nothing and does not loop", () => {
  const { matches, total, groups } = searchScript(play(), "");
  assert.deepEqual(matches, []);
  assert.equal(total, 0);
  assert.deepEqual(groups, []);
});

test("a query of a single space really is searched for", () => {
  // It is not trimmed: searching for a double space is legitimate.
  assert.deepEqual(startsOf(one("a b"), " "), [1]);
});

test("matches never overlap", () => {
  assert.deepEqual(startsOf(one("aaaa"), "aa"), [0, 2]);
});

test("matches come out in the play's reading order", () => {
  const { matches, total, groups } = searchScript(play(), "eleve");
  assert.equal(total, 5);
  assert.deepEqual(
    matches.map((m) => m.index),
    [0, 1, 2, 3, 4]
  );
  const ordinals = matches.map((m) => m.lineOrdinal);
  assert.deepEqual(ordinals, [...ordinals].sort((a, b) => a - b));
  // A line with no match makes no group, and a group carries the RANKS of its act
  // and its scene: it is the panel that turns them into a label, in the play's
  // language (structureLabels.js).
  assert.deepEqual(
    groups.map((g) => [g.actIndex, g.sceneIndex, g.matches.length]),
    [
      [0, 0, 3],
      [1, 0, 2],
    ]
  );
  // The groups share the OBJECTS of the flat array: the panel and the navigation
  // cannot disagree about the current match.
  assert.equal(groups[0].matches[0], matches[0]);
});

test("a match carries what it takes to go there and to quote it", () => {
  const m = searchScript(play(), "dernier").matches[0];
  assert.equal(m.actIndex, 1);
  assert.equal(m.sceneIndex, 0);
  assert.equal(m.lineId, "l-4");
  assert.equal(m.characterId, "c-philinte");
  assert.equal(m.text, "Un dernier élève.");
  assert.equal(typeof m.start, "number");
  assert.equal(typeof m.end, "number");
});

// ---------------------------------------------------------------- excerpts

test("the excerpt frames the match, even in the middle of a long speech", () => {
  const long = "x".repeat(600) + "élève" + "y".repeat(400);
  const m = searchScript(one(long), "eleve").matches[0];
  const { before, hit, after } = matchExcerpt(m);
  assert.equal(hit, "élève");
  assert.ok(before.startsWith("…"), "the excerpt says it cuts on the left");
  assert.ok(after.endsWith("…"), "the excerpt says it cuts on the right");
  // Asymmetric, and only slightly so on the starting side: the row is two lines
  // tall, and the match has to be part of them (cf. EXCERPT_BEFORE /
  // EXCERPT_AFTER).
  assert.equal(before.length, EXCERPT_BEFORE + 1); // the "…" plus the radius
  assert.equal(after.length, EXCERPT_AFTER + 1);
  assert.ok(EXCERPT_BEFORE < EXCERPT_AFTER, "what follows the match has more room");
});

test("the excerpt flattens line breaks", () => {
  // A line can contain some (Shift + Enter); the raw text is not touched for all
  // that, it is the display that holds on one line.
  const m = searchScript(one("Un\ndeux élève"), "eleve").matches[0];
  const { before } = matchExcerpt(m);
  assert.equal(before, "Un deux ");
});

// ------------------------------------------------------------ replacement

test("a replacement that contains the query does not run away", () => {
  assert.equal(replaceInText("aaa", "a", {}, "aa"), "aaaaaa");
});

test("replacing with nothing deletes", () => {
  assert.equal(replaceInText("un mot de trop", "de trop", {}, ""), "un mot ");
});

test("a text with no match is returned unchanged", () => {
  const texte = "Rien à voir ici.";
  assert.equal(replaceInText(texte, "élève", {}, "X"), texte);
  assert.equal(replaceInText(texte, "", {}, "X"), texte);
});

test("an insensitive replacement rewrites the typography of the text found", () => {
  // Intended and documented: replacing "eleve" with "ELEVE" does not give the
  // accents back, and replacing across a curly apostrophe writes what was asked
  // for. Guessing on the user's behalf would be worse.
  assert.equal(replaceInText("L’élève", "eleve", {}, "ELEVE"), "L’ELEVE");
  assert.equal(replaceInText("L’élève", "l'eleve", {}, "L'élève"), "L'élève");
});

test("there are as many replacements as matches counted", () => {
  // The invariant of the single iterator: what the panel announces is exactly
  // what "Replace all" rewrites.
  const script = play();
  const total = searchScript(script, "eleve").total;
  const edits = buildReplaceEdits(script, "eleve", {}, "X");
  const replaced = edits.reduce((n, e) => n + (e.text.match(/X/g)?.length ?? 0), 0);
  assert.equal(replaced, total);
});

test("buildReplaceEdits only names the lines that really changed", () => {
  const edits = buildReplaceEdits(play(), "eleve", {}, "X");
  assert.deepEqual(
    edits.map((e) => e.lineId),
    ["l-1", "l-2", "l-4", "l-5"] // l-3 ("Rien ici.") is not there
  );
  assert.deepEqual(buildReplaceEdits(play(), "", {}, "X"), []);
  assert.deepEqual(buildReplaceEdits(play(), "introuvable", {}, "X"), []);
});

test("replaceOneEdit puts the anchor after what has just been written", () => {
  const m = searchScript(one("Cet élève."), "eleve").matches[0];
  const edit = replaceOneEdit(m, "disciple");
  assert.equal(edit.lineId, "l");
  assert.equal(edit.text, "Cet disciple.");
  assert.equal(edit.nextStart, m.start + "disciple".length);
});
