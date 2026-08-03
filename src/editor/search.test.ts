// Everything hard here is invisible to the eye: an offset slipping on an accent, a
// match lost next to a rejected one, a replacement containing the query.
// The invariant everything rests on is the first test: folding preserves length.
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXCERPT_AFTER,
  EXCERPT_BEFORE,
  buildReplaceEdits,
  foldText,
  matchExcerpt,
  replaceOneEdit,
  searchScript,
} from "./search.ts";
import type { SearchOptions } from "./search.ts";
import type { Script } from "../shared/types.ts";

// Two acts: reading order and grouping cannot be checked on one. Both spellings of
// the apostrophe, as in the real play.
const play = (): Script => ({
  id: "le-misanthrope",
  language: "fr",
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

// One line, so boundary cases read on the text alone.
const one = (text: string): Script => ({
  id: "essai",
  language: "fr",
  title: "Essai",
  characters: [],
  acts: [{ scenes: [{ lines: [{ id: "l", characterId: null, text }] }] }],
});

const startsOf = (script: Script, query: string, options?: SearchOptions) =>
  searchScript(script, query, options).matches.map((m) => m.start);
const countIn = (script: Script, query: string, options?: SearchOptions) =>
  searchScript(script, query, options).total;

// --------------------------------------------------------------- folding

test("folding preserves length, character by character", () => {
  // Each breaks a naive assumption: a lowercase form that grows, a letter with no
  // canonical decomposition, a surrogate pair, an accent already separated.
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
  // The real test is that the offsets cut the right piece of the ORIGINAL text.
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
  // "école" as e + U+0301: "e" must not match the accented one, or a replacement
  // orphans the mark. The final "e" is legitimate.
  assert.deepEqual(startsOf(one("école"), "e"), [5]);
});

// ------------------------------------------------------------------ options

test("by default case and accents are ignored", () => {
  assert.equal(countIn(play(), "ELEVE"), 5);
});

test("Match case still ignores accents", () => {
  // No third checkbox: "eleve" still finds "élève", only the case gets strict.
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
  // The advance-step trap: after a REJECTED candidate one restarts ONE step along.
  // By the query's length, the good match at index 3 is jumped over.
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
  // Not trimmed: searching for a double space is legitimate.
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
  // No match, no group; a group carries RANKS and the panel makes the label.
  assert.deepEqual(
    groups.map((g) => [g.actIndex, g.sceneIndex, g.matches.length]),
    [
      [0, 0, 3],
      [1, 0, 2],
    ]
  );
  // Groups share the OBJECTS of the flat array, so panel and navigation agree.
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
  // Asymmetric: the row is two lines tall and the match must be inside them.
  assert.equal(before.length, EXCERPT_BEFORE + 1); // the "…" plus the radius
  assert.equal(after.length, EXCERPT_AFTER + 1);
  assert.ok(EXCERPT_BEFORE < EXCERPT_AFTER, "what follows the match has more room");
});

test("the excerpt flattens line breaks", () => {
  // Shift+Enter puts them there; the raw text is untouched, only the display flattens.
  const m = searchScript(one("Un\ndeux élève"), "eleve").matches[0];
  const { before } = matchExcerpt(m);
  assert.equal(before, "Un deux ");
});

// ------------------------------------------------------------ replacement

// Rewriting ONE text, through the only door there is: a one-line play. No edit means
// the line was returned untouched, which is exactly what `buildReplaceEdits` omits.
const replaced = (text: string, query: string, options: SearchOptions = {}, replacement = "") => {
  const edits = buildReplaceEdits(one(text), query, options, replacement);
  return edits.length === 0 ? text : edits[0]!.text;
};

test("a replacement that contains the query does not run away", () => {
  assert.equal(replaced("aaa", "a", {}, "aa"), "aaaaaa");
});

test("replacing with nothing deletes", () => {
  assert.equal(replaced("un mot de trop", "de trop", {}, ""), "un mot ");
});

test("a text with no match is returned unchanged", () => {
  const texte = "Rien à voir ici.";
  assert.equal(replaced(texte, "élève", {}, "X"), texte);
  assert.equal(replaced(texte, "", {}, "X"), texte);
});

test("an insensitive replacement rewrites the typography of the text found", () => {
  // Intended: an insensitive replacement rewrites the typography rather than guess.
  assert.equal(replaced("L’élève", "eleve", {}, "ELEVE"), "L’ELEVE");
  assert.equal(replaced("L’élève", "l'eleve", {}, "L'élève"), "L'élève");
});

test("there are as many replacements as matches counted", () => {
  // The single-iterator invariant: what the panel announces is what gets rewritten.
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
