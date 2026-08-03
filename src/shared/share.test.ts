import test from "node:test";
import assert from "node:assert/strict";

import { makeFormats, makeT } from "./i18n.ts";
import { formatShare } from "./share.ts";

// Local catalogue, not the real one: these tests are about the threshold and Intl's
// typography, so a reworded message must not break them.
const SHARE_CATALOGUES = {
  fr: { "stats.shareBelow": "< {value}" },
  en: { "stats.shareBelow": "< {value}" },
};

// Real formatters, not stand-ins: this also checks the typography comes out of Intl.
const FR = { t: makeT("fr", SHARE_CATALOGUES), fmt: makeFormats("fr") };
const EN = { t: makeT("en", SHARE_CATALOGUES), fmt: makeFormats("en") };
// U+00A0 spelled out: indistinguishable from an ordinary space in a literal.
const NBSP = "\u00a0";
const shareFr = (v: number, total: number) => formatShare(v, total, FR.t, FR.fmt);
const shareEn = (v: number, total: number) => formatShare(v, total, EN.t, EN.fmt);

test("formatShare writes the share with one digit after the decimal point", () => {
  assert.equal(shareFr(3, 12), `25,0${NBSP}%`);
  assert.equal(shareFr(1, 3), `33,3${NBSP}%`);
  assert.equal(shareFr(12, 12), `100,0${NBSP}%`);
  // A zero share is a real zero: a character with lines but not one word.
  assert.equal(shareFr(0, 12), `0,0${NBSP}%`);
  assert.equal(shareFr(0, 0), `0,0${NBSP}%`, "empty scope: never NaN on screen");
  // A count against a zero total: the guard is on the DIVISOR, so this is not 500 %.
  assert.equal(shareFr(5, 0), `0,0${NBSP}%`);
});

test("the typography of the share follows the language, and comes from Intl", () => {
  assert.equal(shareEn(1, 3), "33.3%");
  assert.equal(shareEn(12, 12), "100.0%");
  assert.ok(shareFr(1, 3).includes(`${NBSP}%`), "no-break U+00A0 before the sign");
  assert.ok(!/\s/.test(shareEn(1, 3)), "no space at all in English");
});

test("a non-zero share never displays \"0,0 %\"", () => {
  assert.equal(shareFr(1, 10307), `< 0,1${NBSP}%`);
  assert.equal(shareFr(1, 2001), `< 0,1${NBSP}%`, "just under the rounding threshold");
  assert.equal(shareFr(1, 2000), `0,1${NBSP}%`, "at the threshold, rounding is enough");
  // The threshold is formatted, not hard-coded.
  assert.equal(shareEn(1, 10307), "< 0.1%");
});

