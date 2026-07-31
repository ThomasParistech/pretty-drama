// Tests for the computation of the Speaking share page.
//
// This is pure logic, with no React and no DOM: `node --test` runs it as is. What
// is tested here is exactly what cannot be re-read by eye: the wrapping of the
// block (a line straddling three rows must give three rectangles whose widths ADD
// BACK UP to its word count, otherwise the drawing would lie with no way of
// seeing it), the clamping of the scopes, and the fate of lines whose character
// has disappeared.
import test from "node:test";
import assert from "node:assert/strict";


import {
  ALL,
  COLUMNS_STEP,
  DEFAULT_COLUMNS,
  MAX_COLUMNS,
  MIN_COLUMNS,
  TOTAL_SIZE,
  UNIT_SIZE,
  UNKNOWN,
  blockRects,
  centerFontSize,
  clampColumns,
  countWords,
  scopeOf,
  scopeLines,
  speechStats,
} from "./stats.js";

const line = (characterId, text) => ({ id: `l-${characterId}-${text.length}`, characterId, text });

const CHARACTERS = [
  { id: "c-serge", name: "Serge" },
  { id: "c-annie", name: "Annie" },
];

const MANIFEST = {
  acts: [
    {
      title: "Acte I",
      scenes: [
        { title: "Scène 1", lines: [line("c-serge", "un deux trois")] },
        { title: "Scène 2", lines: [line("c-annie", "quatre cinq")] },
      ],
    },
    { title: "Acte II", scenes: [{ title: "Scène 1", lines: [line("c-serge", "six")] }] },
  ],
};

// ----------------------------------------------------------------- countWords

test("countWords splits like the Python reference, apostrophes included", () => {
  assert.equal(countWords("Silence! C'est moi le chef ici."), 7, "\"C'est\" counts as two words");
  assert.equal(countWords("Mettez‑vous ça dans l'crâne."), 6, "the typographic dash separates too");
  assert.equal(countWords("un"), 1);
});

test("countWords ignores punctuation and counts accents as letters", () => {
  assert.equal(countWords("... !? -- «»"), 0);
  assert.equal(countWords("Éléonore où être"), 3);
  assert.equal(countWords("Acte 2 scène 10"), 4, "numbers are words");
});

test("countWords returns zero on anything that is not a text", () => {
  // The manifest can be hand-edited: a line with no text must not bring down the
  // whole page.
  for (const raw of [null, undefined, 42, [], {}, ""]) {
    assert.equal(countWords(raw), 0, `input: ${JSON.stringify(raw)}`);
  }
});

// ----------------------------------------------------------------- scopeLines

test("scopeLines returns the whole play, a whole act, or one scene", () => {
  assert.equal(scopeLines(MANIFEST, ALL, ALL).length, 3);
  assert.equal(scopeLines(MANIFEST, 0, ALL).length, 2, "the whole of act I");
  assert.equal(scopeLines(MANIFEST, 0, 1)[0].characterId, "c-annie");
  assert.equal(scopeLines(MANIFEST, 1, 0)[0].characterId, "c-serge");
});

test("scopeLines keeps the order of the play, not an order within a scene", () => {
  // The block is a TIMELINE: the order is the only information it carries on top
  // of the colours.
  assert.deepEqual(
    scopeLines(MANIFEST, ALL, ALL).map((l) => l.text),
    ["un deux trois", "quatre cinq", "six"]
  );
});

test("scopeLines clamps the ranks instead of returning nothing", () => {
  // A manifest reloaded under a rank that has become too large: the page must
  // fall back on a scene that exists, not read as empty.
  assert.equal(scopeLines(MANIFEST, 99, 99).length, 1);
  // Any unusable rank means "all of that level", and not only -1: otherwise -1
  // returned the whole play and -5 silently fell back on the first scene, two
  // behaviours for one and the same mistake.
  assert.equal(scopeLines(MANIFEST, -5, -5).length, 3);
  assert.equal(scopeLines(MANIFEST, NaN, NaN).length, 3, "a Number(\"\") coming from a select");
  assert.equal(scopeLines(MANIFEST, 0, 1.5).length, 2, "a non-integer rank indexes nothing");
});

test("scopeLines takes a missing or misshapen manifest", () => {
  for (const raw of [null, undefined, {}, { acts: null }, { acts: [] }, { acts: [{}] }, 42]) {
    assert.deepEqual(scopeLines(raw, ALL, ALL), [], `manifest: ${JSON.stringify(raw)}`);
  }
  assert.deepEqual(scopeLines({ acts: [{ scenes: [{ lines: null }] }] }, 0, 0), []);
});

// -------------------------------------------------------------------- scopeOf

test("scopeOf returns the LEVEL and the ranks, not a sentence", () => {
  // It is the caller that puts the scope into words, with the reader's locale:
  // here we only return ranks, which keeps this module pure and testable as is.
  assert.deepEqual(scopeOf(MANIFEST, ALL, ALL), { kind: "all" });
  assert.deepEqual(scopeOf(MANIFEST, 0, ALL), { kind: "act", actIndex: 0 });
  assert.deepEqual(scopeOf(MANIFEST, 0, 1), { kind: "scene", actIndex: 0, sceneIndex: 1 });
});

test("scopeOf clamps its ranks, so the caller has nothing to re-check", () => {
  assert.deepEqual(scopeOf(MANIFEST, 99, 99).kind, "scene");
  const scoped = scopeOf(MANIFEST, 99, 99);
  assert.ok(scoped.actIndex < MANIFEST.acts.length);
  assert.ok(scoped.sceneIndex < MANIFEST.acts[scoped.actIndex].scenes.length);
});

test("scopeOf falls back on the whole play rather than on a phantom act", () => {
  assert.deepEqual(scopeOf(null, ALL, ALL), { kind: "all" });
  assert.deepEqual(scopeOf({ acts: [] }, 0, 0), { kind: "all" });
  // An act with no scene: we stay at act level instead of designating a scene
  // that does not exist.
  assert.deepEqual(scopeOf({ acts: [{ scenes: [] }] }, 0, 0), { kind: "act", actIndex: 0 });
});

// ---------------------------------------------------------------- speechStats

test("speechStats counts the words and the lines per character", () => {
  const { rows, totalWords, totalLines } = speechStats(
    [line("c-serge", "un deux trois"), line("c-annie", "quatre"), line("c-serge", "cinq six")],
    CHARACTERS
  );
  assert.equal(totalWords, 6);
  assert.equal(totalLines, 3);
  const serge = rows.find((r) => r.id === "c-serge");
  assert.equal(serge.words, 5);
  assert.equal(serge.lines, 2, "two lines, never merged for the pie chart");
});

test("speechStats sorts from the most talkative to the least, like the slices", () => {
  const { rows } = speechStats(
    [line("c-annie", "un"), line("c-serge", "un deux trois quatre")],
    CHARACTERS
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["c-serge", "c-annie"]
  );
});

test("speechStats omits a character who is silent in the scope", () => {
  // Otherwise the legend of a two-character scene would list the whole cast, with
  // shares at zero.
  const { rows } = speechStats([line("c-serge", "un")], CHARACTERS);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["c-serge"]
  );
});

test("a line with no known character is counted apart, never blended in", () => {
  // Same stance as the Progress grid: these lines swell the total and belong to
  // nobody, so they are made visible.
  const { rows, totalWords } = speechStats(
    [line("c-serge", "un"), line(null, "deux trois"), line("c-fantome", "quatre")],
    CHARACTERS
  );
  const unknown = rows.find((r) => r.id === UNKNOWN);
  assert.ok(unknown, "the orphans have their own row");
  assert.equal(unknown.words, 3, "a null characterId AND an unknown id fall in the same bucket");
  assert.equal(unknown.lines, 2);
  assert.equal(unknown.name, null, "no name to display, the caller supplies the label");
  assert.equal(totalWords, 4, "the total counts them, it does not hide them");
});

test("speechStats counts an empty line as a line of zero words", () => {
  const { rows, totalWords, totalLines } = speechStats([line("c-serge", "")], CHARACTERS);
  assert.equal(totalWords, 0);
  assert.equal(totalLines, 1, "it exists in the play");
  assert.equal(rows[0].words, 0);
});

test("speechStats takes a misshapen scope or cast", () => {
  for (const raw of [null, undefined, 42, [null, 42, {}]]) {
    assert.doesNotThrow(() => speechStats(raw, CHARACTERS), `lines: ${JSON.stringify(raw)}`);
  }
  assert.doesNotThrow(() => speechStats([line("c-serge", "un")], null));
});

// -------------------------------------------------------------- centerFontSize

test("the centre of the ring keeps its nominal size on today's texts", () => {
  // The shrinking must change NOTHING about what the page already draws:
  // otherwise a setting written for an extreme case would shrink every ring on
  // the site.
  assert.equal(centerFontSize("10307", TOTAL_SIZE), TOTAL_SIZE, "the play's 10,307 words");
  assert.equal(centerFontSize(10307, TOTAL_SIZE), TOTAL_SIZE, "a number, not a string");
  assert.equal(centerFontSize("répliques", UNIT_SIZE), UNIT_SIZE, "the longest unit");
  assert.equal(centerFontSize("mots", UNIT_SIZE), UNIT_SIZE);
  for (const raw of ["", null, undefined]) {
    assert.equal(centerFontSize(raw, TOTAL_SIZE), TOTAL_SIZE, `nothing to fit: ${raw}`);
  }
});

test("the thousands separator does not count as a digit", () => {
  // Now that the total goes through `fmt.number`, the centre line carries a
  // narrow no-break space in French and a comma in English. Counted at full
  // width, these characters dropped the published play's total from 17 to 14.5
  // units, a shrinking of 15 % for a line that only widens by 6 %: this guard is
  // what holds the gap, and without it the site's flagship page shrank its
  // biggest figure as it gained its typography.
  const nu = centerFontSize("10307", TOTAL_SIZE);
  for (const separateur of ["\u202f", "\u00a0", " ", ","]) {
    const groupe = centerFontSize(`10${separateur}307`, TOTAL_SIZE);
    assert.ok(groupe < nu, `"10${separateur}307" is wider than "10307"`);
    assert.ok(
      groupe > nu * 0.95,
      `a separator must not cost a whole digit (${separateur.codePointAt(0)})`
    );
  }
  // And it stays narrower than a digit: six full digits go much lower than five
  // digits plus a separator.
  assert.ok(centerFontSize("103070", TOTAL_SIZE) < centerFontSize("10\u202f307", TOTAL_SIZE));
});

test("the centre of the ring shrinks an over-long text and caps its width", () => {
  // What the computation promises: the line never overflows the hole of the ring,
  // so its rendered width (number of characters x size) stops growing once the
  // cap is reached, whatever the length. It is that invariance that is checked,
  // rather than copying the module's constants here, which would only move the
  // problem.
  const width = (text, nominal) => String(text).length * centerFontSize(text, nominal);
  assert.ok(centerFontSize("1234567", TOTAL_SIZE) < TOTAL_SIZE, "seven digits do not fit");
  assert.ok(
    Math.abs(width("1234567", TOTAL_SIZE) - width("123456789012", TOTAL_SIZE)) < 1e-9,
    "the width is the same as soon as we shrink"
  );
  // And never LARGER than the nominal: a single-digit total is not drawn as a big
  // headline in the middle of the ring.
  assert.equal(centerFontSize("7", TOTAL_SIZE), TOTAL_SIZE);
});

// --------------------------------------------------------------- clampColumns

test("the default setting is the reference's own", () => {
  // `generate_viz.py` drew the whole play at `w=100` and each scene at `w=50`: the
  // page serves the same document as the troupe's PDF, so its block is read at the
  // width it has always been read at. These two values are exactly the default and
  // the lower bound, the slider's travel merely extends them.
  assert.equal(DEFAULT_COLUMNS, 100);
  assert.equal(MIN_COLUMNS, 50);
  assert.ok(DEFAULT_COLUMNS >= MIN_COLUMNS && DEFAULT_COLUMNS <= MAX_COLUMNS);
  // The three figures land on the step grid: a value off the grid would make the
  // first press of a keyboard arrow jump.
  for (const value of [MIN_COLUMNS, DEFAULT_COLUMNS, MAX_COLUMNS]) {
    assert.equal((value - MIN_COLUMNS) % COLUMNS_STEP, 0, `${value} off the grid`);
  }
});

test("clampColumns holds the setting within its bounds", () => {
  assert.equal(clampColumns(60), 60);
  assert.equal(clampColumns(MIN_COLUMNS - 1), MIN_COLUMNS);
  assert.equal(clampColumns(MAX_COLUMNS + 1000), MAX_COLUMNS);
  assert.equal(clampColumns("96"), 96, "the value of an input arrives as a string");
  assert.equal(clampColumns(96.4), 96, "an integer, since it is a number of words");
});

test("clampColumns falls back on the default rather than on an absurd block", () => {
  // It is what feeds the viewBox: an unreadable value there would make an
  // unreadable drawing, that is, a breakage nobody sees.
  for (const raw of [NaN, Infinity, -Infinity, undefined, "abc"]) {
    assert.equal(clampColumns(raw), DEFAULT_COLUMNS, `input: ${raw}`);
  }
});

// ----------------------------------------------------------------- blockRects

test("the sum of the widths gives the word total back", () => {
  // THE contract of the block: each word occupies exactly one square, once.
  const lines = [
    line("c-serge", "un deux trois quatre cinq six sept"),
    line("c-annie", "huit neuf dix onze"),
    line("c-serge", "douze"),
  ];
  const { rects, words } = blockRects(lines, 5, CHARACTERS);
  assert.equal(words, 12);
  assert.equal(
    rects.reduce((sum, r) => sum + r.width, 0),
    12
  );
});

test("a run straddling three rows gives three rectangles", () => {
  const { rects, rows } = blockRects([line("c-serge", "a b c d e f g h i j k l")], 5, CHARACTERS);
  assert.equal(rows, 3);
  assert.deepEqual(
    rects.map((r) => [r.x, r.y, r.width]),
    [
      [0, 0, 5],
      [0, 1, 5],
      [0, 2, 2],
    ]
  );
});

test("no rectangle goes past the width of the block", () => {
  const lines = [line("c-serge", "a b c d e f g"), line("c-annie", "h i"), line("c-serge", "j k l m")];
  for (const columns of [1, 3, 7, 24]) {
    for (const r of blockRects(lines, columns, CHARACTERS).rects) {
      assert.ok(r.x >= 0 && r.x + r.width <= columns, `columns ${columns}: ${JSON.stringify(r)}`);
      assert.ok(r.width > 0, "an empty rectangle does not draw");
    }
  }
});

test("consecutive lines of the same character merge into one run", () => {
  // They would be adjacent and of the same colour: two rectangles instead of one,
  // for nothing. That is what keeps the rectangle count in the hundreds rather
  // than in the thousands over the whole play.
  const { rects } = blockRects([line("c-serge", "un deux"), line("c-serge", "trois")], 100, CHARACTERS);
  assert.equal(rects.length, 1);
  assert.equal(rects[0].width, 3);
});

test("a line with no word occupies no square and does not cut a run", () => {
  const { rects, words } = blockRects(
    [line("c-serge", "un deux"), line("c-annie", "   "), line("c-serge", "trois")],
    100,
    CHARACTERS
  );
  assert.equal(words, 2 + 1);
  assert.equal(rects.length, 1, "the empty line does not interrupt the merge");
});

test("blockRects keeps the character of each run, unknown included", () => {
  const { rects } = blockRects([line("c-serge", "un"), line(null, "deux")], 100, CHARACTERS);
  assert.deepEqual(
    rects.map((r) => r.characterId),
    ["c-serge", UNKNOWN]
  );
});

test("the block and the counts put the orphans in the SAME bucket", () => {
  // That is what makes "Unknown character" isolatable from the block's legend: the
  // legend sends the `row.id` of the counts, and the block compares it with the
  // `characterId` of its runs. When the block kept the raw id, neither a null
  // `characterId` nor a deleted character ever equalled that bucket, so isolating
  // the "Unknown character" row switched off the whole block.
  const lines = [
    line("c-serge", "un"),
    line(null, "deux"),
    line("c-fantome", "trois"), // a character deleted from the script by hand
  ];
  const { rows } = speechStats(lines, CHARACTERS);
  const { rects } = blockRects(lines, 100, CHARACTERS);
  const isolated = rows.find((r) => r.id === UNKNOWN).id;
  assert.ok(
    rects.some((r) => r.characterId === isolated),
    "at least one run lights up when the orphans are isolated"
  );
  assert.deepEqual(
    rects.map((r) => r.characterId),
    ["c-serge", UNKNOWN],
    "the two neighbouring orphans merge: same bucket, same colour"
  );
});

test("blockRects takes an empty or misshapen scope without returning zero rows", () => {
  // `rows` is at least 1: a viewBox of height 0 does not draw and the SVG element
  // collapses.
  for (const raw of [[], null, undefined, 42, [null, {}]]) {
    const block = blockRects(raw, 10, CHARACTERS);
    assert.deepEqual(block.rects, [], `input: ${JSON.stringify(raw)}`);
    assert.equal(block.rows, 1);
    assert.equal(block.words, 0);
  }
});

test("blockRects defends itself against an absurd width", () => {
  for (const columns of [0, -3, NaN, null, undefined, 0.4]) {
    const block = blockRects([line("c-serge", "un deux")], columns, CHARACTERS);
    assert.ok(block.columns >= 1, `columns: ${columns}`);
    assert.equal(
      block.rects.reduce((sum, r) => sum + r.width, 0),
      2
    );
  }
});
