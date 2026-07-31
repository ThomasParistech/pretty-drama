// Tests for the character palette.
//
// What is tested here is exactly what cannot be re-read by eye: that the colour
// fill-in is DETERMINISTIC (Editing and Speaking share replay it separately on
// the same characters and must agree), that it does not give the same colour
// twice before the palette is exhausted, and that the first ten entries really
// are Tableau 10 (that is the promise made to a troupe of ten characters or
// fewer: the palette at full strength, no pale tint).
import test from "node:test";
import assert from "node:assert/strict";

import {
  CHARACTER_COLOR_KEYS,
  CHARACTER_COLORS,
  assignColors,
  characterColor,
  characterInk,
  firstFreeColor,
  isPaletteColor,
} from "./characterColors.js";

const TAB10 = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
];

const cast = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `P${i}` }));

// ------------------------------------------------------------------ palette

test("the first ten colours are Tableau 10, in its order", () => {
  // The promise of the Speaking share page: a troupe of ten characters or fewer
  // only ever sees the canonical register, never a light tint from tab20.
  assert.deepEqual(CHARACTER_COLORS.slice(0, 10), TAB10);
});

test("the palette holds twenty distinct colours, all in lowercase hex", () => {
  assert.equal(CHARACTER_COLORS.length, 20);
  assert.equal(new Set(CHARACTER_COLORS).size, 20, "no duplicate in the palette");
  for (const c of CHARACTER_COLORS) assert.match(c, /^#[0-9a-f]{6}$/, `colour: ${c}`);
});

test("every colour has its name key, otherwise a swatch announces itself \"undefined\"", () => {
  // These keys serve as the `aria-label` of the twenty swatches of the editor's
  // palette, indexed by rank: a shorter list would put `undefined` there, and
  // only a screen reader would notice. That the key EXISTS in both catalogues is
  // checked elsewhere (test_contracts.py, which collects the literal `t("…")`
  // calls and the keys built by pattern).
  assert.equal(CHARACTER_COLOR_KEYS.length, CHARACTER_COLORS.length);
  assert.equal(new Set(CHARACTER_COLOR_KEYS).size, CHARACTER_COLOR_KEYS.length, "no homonym");
  for (const key of CHARACTER_COLOR_KEYS) {
    assert.match(key, /^color\.[a-zA-Z]+$/, `key: ${key}`);
  }
});

test("isPaletteColor accepts only the palette, and tolerates any other input", () => {
  assert.ok(isPaletteColor("#1f77b4"));
  assert.ok(isPaletteColor("#1F77B4"), "a hand-edited script.json may shout");
  for (const value of [null, undefined, 42, "", "rouge", "#123456", "oklch(0.58 0.14 255)", {}, []]) {
    assert.equal(isPaletteColor(value), false, `input: ${JSON.stringify(value)}`);
  }
});

// ------------------------------------------------------------- firstFreeColor

test("firstFreeColor returns the first free one, then wraps once the palette is exhausted", () => {
  assert.equal(firstFreeColor(new Set()), CHARACTER_COLORS[0]);
  assert.equal(firstFreeColor(new Set([CHARACTER_COLORS[0]])), CHARACTER_COLORS[1]);
  // Palette exhausted: we wrap around rather than return undefined, otherwise a
  // 21st character would have no colour and the legend would show a hole.
  const full = new Set(CHARACTER_COLORS);
  assert.equal(firstFreeColor(full, 20), CHARACTER_COLORS[0]);
  // And the wrap ADVANCES. The count is passed separately because `used` stops
  // growing as soon as the palette is exhausted: relying on it gave the same
  // colour to every character beyond the twentieth.
  assert.equal(firstFreeColor(full, 21), CHARACTER_COLORS[1]);
  assert.equal(firstFreeColor(full, 43), CHARACTER_COLORS[3]);
});

// --------------------------------------------------------------- assignColors

test("a cast with no colours receives the palette in order", () => {
  // This is the REAL case: the published script.json carried no colour at all.
  const colors = assignColors(cast(10));
  assert.deepEqual([...colors.values()], TAB10);
});

test("the fill-in is deterministic, so two pages agree", () => {
  const characters = cast(7);
  assert.deepEqual([...assignColors(characters).values()], [...assignColors(characters).values()]);
});

test("a colour already chosen is kept, and is not given again to another", () => {
  const colors = assignColors([
    { id: "a", name: "Alceste", color: "#2ca02c" },
    { id: "b", name: "Philinte" },
    { id: "c", name: "Oronte" },
  ]);
  assert.equal(colors.get("a"), "#2ca02c", "the coordinator's choice survives");
  assert.equal(colors.get("b"), "#1f77b4", "the first free one, not the first outright");
  assert.equal(colors.get("c"), "#ff7f0e");
});

test("a foreign or duplicated colour is replaced, never kept", () => {
  const colors = assignColors([
    { id: "a", name: "A", color: "#1f77b4" },
    { id: "b", name: "B", color: "#1f77b4" },
    { id: "c", name: "C", color: "chartreuse" },
    { id: "d", name: "D", color: null },
  ]);
  assert.equal(colors.get("a"), "#1f77b4");
  assert.notEqual(colors.get("b"), "#1f77b4", "the duplicate leaves with a fresh colour");
  assert.equal(new Set(colors.values()).size, 4, "four characters, four colours");
  for (const color of colors.values()) assert.ok(isPaletteColor(color));
});

test("no colour repeats before the palette is exhausted", () => {
  const colors = assignColors(cast(20));
  assert.equal(new Set(colors.values()).size, 20);
});

test("beyond twenty, the palette really wraps instead of freezing", () => {
  // The trap: `used` stops growing when the palette is exhausted, so a fallback
  // computed from it gave #1f77b4 to the 21st as well as to the 25th, and a
  // troupe of 25 characters had five characters of the same blue.
  const colors = assignColors(cast(25));
  assert.equal(colors.size, 25);
  assert.deepEqual(
    [20, 21, 22, 23, 24].map((i) => colors.get(`c${i}`)),
    CHARACTER_COLORS.slice(0, 5)
  );
  for (const color of colors.values()) assert.ok(isPaletteColor(color));
});

test("assignColors takes a dubious cast without crashing", () => {
  // Tolerant mirror of sanitize_script: the manifest can be hand-edited.
  for (const raw of [null, undefined, 42, "texte", {}, [null, 42, "x", { name: "sans id" }]]) {
    assert.doesNotThrow(() => assignColors(raw), `input: ${JSON.stringify(raw)}`);
  }
  assert.equal(assignColors([{ id: "a", name: "A" }, { id: "a", name: "Aussi A" }]).size, 1);
});

// ------------------------------------------------------------ characterColor

test("characterColor reads the stored colour, without filling it in", () => {
  // Unlike `assignColors`: this is the editor's per-line-row call, and
  // `sanitizeScript` already guarantees the colour there. Filling in here would
  // rebuild the whole cast on every row.
  const characters = [{ id: "a", name: "A", color: "#2ca02c" }, { id: "b", name: "B" }];
  assert.equal(characterColor(characters, "a"), "#2ca02c");
  assert.equal(characterColor(characters, "b"), null, "no stored colour, no colour");
  assert.equal(characterColor(characters, "fantome"), null);
  assert.equal(characterColor(characters, null), null);
  assert.equal(characterColor(null, "a"), null);
});

test("characterColor rejects a colour outside the palette rather than paint it", () => {
  // It would end up in a `style` attribute: we return null and the caller sets
  // its neutral token.
  assert.equal(characterColor([{ id: "a", color: "chartreuse" }], "a"), null);
});

// -------------------------------------------------------------- characterInk

test("characterInk caps the lightness and keeps the colour's chroma", () => {
  // The cap, not a mix with black: mixing dimmed the colour at the same time as
  // it darkened it, and in the editor the character's name read as black. Cf. the
  // comment on `characterInk`.
  assert.equal(characterInk("#bcbd22"), "oklch(from #bcbd22 min(l, 0.5) c h)");
  for (const color of CHARACTER_COLORS) {
    const ink = characterInk(color);
    assert.match(ink, /^oklch\(from #[0-9a-f]{6} min\(l, 0\.5\) c h\)$/, `colour: ${color}`);
    assert.ok(ink.includes(" c h)"), "the chroma and the hue are taken as they are");
  }
});
