// Tests for the derived act and scene labels.
//
// These labels replaced a stored `title`, so they are now the ONLY way a scene is
// named anywhere on the site and in the printed script. The numeral is the part
// worth testing: an actor finds their place by it, and Python derives the same
// labels for the PDF (build_script_pdf.py), so the two must agree.
import test from "node:test";
import assert from "node:assert/strict";

import { makeT } from "./i18n.js";
import { actLabel, romanNumeral, sceneLabel } from "./structureLabels.js";

const CATALOGUES = {
  fr: { "structure.act": "Acte {n}", "structure.scene": "Scène {n}" },
  en: { "structure.act": "Act {n}", "structure.scene": "Scene {n}" },
};

test("roman numerals cover every act count a play could plausibly have", () => {
  const expected = {
    1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 8: "VIII", 9: "IX",
    10: "X", 11: "XI", 14: "XIV", 19: "XIX", 20: "XX", 24: "XXIV", 39: "XXXIX",
  };
  for (const [n, want] of Object.entries(expected)) {
    assert.equal(romanNumeral(Number(n)), want, `${n} -> ${want}`);
  }
});

test("romanNumeral gives up on digits rather than inventing a numeral", () => {
  // No play has 40 acts, and a wrong numeral would be worse than a number.
  assert.equal(romanNumeral(40), "40");
  assert.equal(romanNumeral(0), "0");
  assert.equal(romanNumeral(-3), "-3");
  assert.equal(romanNumeral(1.5), "1.5");
  assert.equal(romanNumeral("x"), "x");
});

test("the labels are 1-based while the indexes are 0-based", () => {
  // The whole codebase indexes acts and scenes from zero; the reader counts from
  // one. Getting this backwards would silently misname every scene.
  const t = makeT("fr", CATALOGUES);
  assert.equal(actLabel(t, 0), "Acte I");
  assert.equal(sceneLabel(t, 0), "Scène 1");
  assert.equal(actLabel(t, 2), "Acte III");
  assert.equal(sceneLabel(t, 9), "Scène 10");
});

test("the labels follow the locale", () => {
  const en = makeT("en", CATALOGUES);
  assert.equal(actLabel(en, 1), "Act II");
  assert.equal(sceneLabel(en, 4), "Scene 5");
});

test("the numeral is identical in both languages, so a place stays findable", () => {
  // An English reader and a French one must agree on WHICH scene, even when the
  // word differs; the PDF is derived from the play's language, the screen from
  // the reader's.
  const fr = makeT("fr", CATALOGUES);
  const en = makeT("en", CATALOGUES);
  for (let i = 0; i < 12; i++) {
    const digits = (label) => label.replace(/[^0-9IVXL]/g, "");
    assert.equal(digits(actLabel(fr, i)), digits(actLabel(en, i)), `act ${i}`);
    assert.equal(digits(sceneLabel(fr, i)), digits(sceneLabel(en, i)), `scene ${i}`);
  }
});
