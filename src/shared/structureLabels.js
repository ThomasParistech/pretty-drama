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
//
// WHICH LANGUAGE, and it depends on the page, which is why `t` is a parameter
// rather than an import. Four of the five pages that name a scene (Rehearsal,
// Recording, Progress, Speaking share) hand over the reader's `t`: there a label
// is NAVIGATION, one picks a scene in a play one does not touch, and navigation
// is written in the language one reads. The EDITOR hands over a `t` bound to the
// play's own `language` (`translator` in locale.js), because there one SHAPES the
// document: what the plan, the column heading and the search results call an act
// is exactly what the printed script will call it, and a coordinator proof-reading an
// English play should not see French headings over English lines.
// Python composes the same labels for the PDF, from the play's `language` too
// (see build_script_pdf.py): the Editor and the paper now agree word for word.
// The number is the same in every language, so nobody ever loses their place.

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
