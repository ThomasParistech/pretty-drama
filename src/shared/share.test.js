// How a share is written, and the threshold that stops it from lying. Two pages
// write one (the legend of the Speaking share page, a play's card on the two root
// pages), so the rule lives in a single module and its test along with it.
import test from "node:test";
import assert from "node:assert/strict";

import { makeFormats, makeT } from "./i18n.js";
import { formatShare, share } from "./share.js";

// The only message `formatShare` needs. A local catalogue rather than the real
// one: these tests are about the arithmetic of the threshold and about Intl's
// typography, not about the wording, which can be reworded without breaking them.
const SHARE_CATALOGUES = {
  fr: { "stats.shareBelow": "< {value}" },
  en: { "stats.shareBelow": "< {value}" },
};

test("share never divides by zero", () => {
  assert.equal(share(3, 12), 25);
  assert.equal(share(0, 0), 0, "an empty scope: 0 %, not NaN in the drawing");
  assert.equal(share(5, 0), 0);
});

// `formatShare` takes `t` and `fmt` as arguments, like `actLabel`: the module
// stays pure, and the tests supply real formatters rather than stand-ins, which
// also checks that the typography really does come out of Intl.
const FR = { t: makeT("fr", SHARE_CATALOGUES), fmt: makeFormats("fr") };
const EN = { t: makeT("en", SHARE_CATALOGUES), fmt: makeFormats("en") };
// U+00A0 spelled out: Intl produces it before the `%` in French, and it is
// indistinguishable from an ordinary space in a literal.
const NBSP = "\u00a0";
const shareFr = (v, total) => formatShare(v, total, FR.t, FR.fmt);
const shareEn = (v, total) => formatShare(v, total, EN.t, EN.fmt);

test("formatShare writes the share with one digit after the decimal point", () => {
  assert.equal(shareFr(3, 12), `25,0${NBSP}%`);
  assert.equal(shareFr(1, 3), `33,3${NBSP}%`);
  assert.equal(shareFr(12, 12), `100,0${NBSP}%`);
  // A zero share is a real zero: this is the legend of a character who has lines
  // but not a single word (an empty line), and there "0,0 %" is exact.
  assert.equal(shareFr(0, 12), `0,0${NBSP}%`);
  assert.equal(shareFr(0, 0), `0,0${NBSP}%`, "empty scope: never NaN on screen");
});

test("the typography of the share follows the language, and comes from Intl", () => {
  // The previous code did a `.replace(".", ",")` and an ordinary space before the
  // `%`. Intl gives the comma AND a real no-break space in French, and neither of
  // them in English.
  assert.equal(shareEn(1, 3), "33.3%");
  assert.equal(shareEn(12, 12), "100.0%");
  assert.ok(shareFr(1, 3).includes(`${NBSP}%`), "no-break U+00A0 before the sign");
  assert.ok(!/\s/.test(shareEn(1, 3)), "no space at all in English");
});

test("a non-zero share never displays \"0,0 %\"", () => {
  // One word out of the play's ten thousand: rounding would show it as zero next
  // to a count of 1, which reads like a bug. Below a tenth of a point, we state
  // the threshold and not the value.
  assert.equal(shareFr(1, 10307), `< 0,1${NBSP}%`);
  assert.equal(shareFr(1, 2001), `< 0,1${NBSP}%`, "just under the rounding threshold");
  assert.equal(shareFr(1, 2000), `0,1${NBSP}%`, "at the threshold, rounding is enough");
  // The threshold is formatted, not hard-coded: English has neither comma nor
  // space.
  assert.equal(shareEn(1, 10307), "< 0.1%");
});

