// Labels of acts and scenes, DERIVED from their rank: a stored title would be data in
// one language travelling to the manifest, the PDF and the Progress columns.
// Pure, `t` is a PARAMETER: the four navigating pages pass the reader's `t`, the Editor
// passes one bound to the play's `language`, because there you shape what the PDF prints.
// Contract: build_script_pdf.py composes the same labels.

// Roman for acts, digits for scenes. Beyond 39 it returns the digits: no play has 40
// acts, and a wrong numeral is worse than a number.
const TENS = ["", "X", "XX", "XXX"];
const UNITS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

export function romanNumeral(n) {
  if (!Number.isInteger(n) || n < 1 || n > 39) return String(n);
  return TENS[Math.floor(n / 10)] + UNITS[n % 10];
}

// `index` is 0-based; the label is 1-based.
export function actLabel(t, index) {
  return t("structure.act", { n: romanNumeral(index + 1) });
}

export function sceneLabel(t, index) {
  return t("structure.scene", { n: index + 1 });
}
