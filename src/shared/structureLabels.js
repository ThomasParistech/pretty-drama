// The labels of acts and scenes, DERIVED from their rank.
//
// Acts and scenes carry no title in script.json (see reducer.js): a stored title
// would be data in one language, travelling to the manifest, the PDF, the
// Progress columns and the Speaking share scope, where nothing could translate
// it. Deriving the label makes it ordinary UI text.
//
// Pure, and takes `t` as an argument rather than importing locale.js, so nothing
// here drags a DOM into a module. Its consumers are components (stats/App.jsx,
// SearchPanel.jsx, StructurePanel.jsx, dashboard/App.jsx and the two page
// selects), never the pure modules themselves: `stats.js` and `search.js` now
// hand out RANKS precisely so they never need words.
// Python derives the same labels for the PDF, from the play's own `language`
// rather than from the reader's locale: on screen an act label is navigation and
// belongs in the reader's language, on paper it is the document. The number is
// the same either way, so nobody loses their place.

// Roman numerals for acts, digits for scenes, which is the convention of the
// printed script this project reproduces. Beyond 39 it gives up and returns the
// digits: no play has 40 acts, and a wrong numeral would be worse than a number.
const TENS = ["", "X", "XX", "XXX"];
const UNITS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

export function romanNumeral(n) {
  if (!Number.isInteger(n) || n < 1 || n > 39) return String(n);
  return TENS[Math.floor(n / 10)] + UNITS[n % 10];
}

// `index` is 0-based, as everywhere in this codebase; the label is 1-based.
export function actLabel(t, index) {
  return t("structure.act", { n: romanNumeral(index + 1) });
}

export function sceneLabel(t, index) {
  return t("structure.scene", { n: index + 1 });
}
