// Tests for the translation engine.
//
// What is worth testing here is what cannot be re-read by eye: the priority
// between the three locale layers, the plural categories (where French and
// English genuinely disagree at zero), and the fact that a message survives a
// missing key or a missing parameter instead of rendering a blank.
//
// Nothing here touches a catalogue file: `makeT` takes its catalogues as an
// argument, so these tests own their fixtures and cannot break when a UI string
// is reworded. Catalogue content is checked separately, by locales/parity.test.js
// and by the guards in scripts/tests/test_contracts.py.
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  makeFormats,
  makeT,
  resolveLocale,
  split,
} from "./i18n.js";

const CATALOGUES = {
  fr: {
    "hello": "Bonjour",
    "greet": "Bonjour {name}",
    "lines": { one: "{count} réplique", other: "{count} répliques" },
    "onlyFr": "Seulement en français",
    "rich": "Déposer des {voices} ou le {script}",
  },
  en: {
    "hello": "Hello",
    "greet": "Hello {name}",
    "lines": { one: "{count} line", other: "{count} lines" },
    "rich": "Drop {voices} or the {script}",
  },
};

// Some assertions below depend on the CLDR data of a full-ICU Node build. A
// minimal build silently resolves every locale to English, which would fail them
// for a reason that has nothing to do with this code.
const HAS_FRENCH_DATA = new Intl.NumberFormat("fr").resolvedOptions().locale.startsWith("fr");

// ---------------------------------------------------------------- the locales

test("the default locale is French and is one of the known locales", () => {
  assert.equal(DEFAULT_LOCALE, "fr");
  assert.ok(LOCALES.includes(DEFAULT_LOCALE));
});

test("isLocale accepts only known bare locales, and tolerates any input", () => {
  assert.ok(isLocale("fr"));
  assert.ok(isLocale("en"));
  for (const value of [null, undefined, 42, "", "FR", "en-GB", "de", {}, []]) {
    assert.equal(isLocale(value), false, `input: ${JSON.stringify(value)}`);
  }
});

// ------------------------------------------------------------- resolveLocale

test("an explicit ?lang wins over everything else", () => {
  // A shared link must be able to carry its language even against a stored
  // choice, because that is the only way to hand someone the site in a given
  // language. locale.js then writes it to the store, so it sticks.
  assert.equal(resolveLocale({ search: "?lang=en", stored: "fr", languages: ["fr-FR"] }), "en");
  assert.equal(resolveLocale({ search: "?lang=fr", stored: "en", languages: ["en-US"] }), "fr");
  assert.equal(resolveLocale({ search: "lang=en" }), "en", "a search string without its ? still parses");
  assert.equal(resolveLocale({ search: "?a=1&lang=en&b=2" }), "en");
});

test("the stored choice beats the navigator", () => {
  // THE scenario this whole design exists for: a French browser and a
  // deliberate English choice. Without the stored layer, navigator.language
  // drags the user back to French on every page that loses the query string.
  assert.equal(resolveLocale({ stored: "en", languages: ["fr-FR", "fr"] }), "en");
  assert.equal(resolveLocale({ stored: "fr", languages: ["en-US", "en"] }), "fr");
});

test("with nothing stored, the navigator decides, and regional tags count", () => {
  assert.equal(resolveLocale({ languages: ["en-GB", "fr"] }), "en");
  assert.equal(resolveLocale({ languages: ["fr-CA"] }), "fr");
  assert.equal(resolveLocale({ languages: ["EN-us"] }), "en", "tags are compared case-insensitively");
});

test("the navigator list is scanned in order, skipping unknown languages", () => {
  assert.equal(resolveLocale({ languages: ["de", "es-ES", "en-GB", "fr"] }), "en");
  assert.equal(resolveLocale({ languages: ["de", "es"] }), DEFAULT_LOCALE, "none known, so French");
});

test("an unknown ?lang falls through to the next layer, not straight to French", () => {
  // A typo in a shared link must not silently override a deliberate choice.
  assert.equal(resolveLocale({ search: "?lang=xx", stored: "en" }), "en");
  assert.equal(resolveLocale({ search: "?lang=", stored: "en" }), "en");
  assert.equal(resolveLocale({ search: "?lang=en-GB", stored: "en" }), "en", "?lang takes a bare locale");
  assert.equal(resolveLocale({ search: "?lang=xx", languages: ["en"] }), "en");
});

test("a corrupted stored value is ignored rather than trusted", () => {
  // The store is localStorage: a user, an extension or an old version can have
  // put anything in there.
  for (const stored of ["", "xx", "en-GB", "null", 42, null, undefined, {}]) {
    assert.equal(
      resolveLocale({ stored, languages: ["en"] }),
      "en",
      `stored: ${JSON.stringify(stored)}`
    );
  }
});

test("resolveLocale never throws, whatever it is handed", () => {
  // It runs before anything is rendered: a throw here is a blank page.
  assert.equal(resolveLocale(), DEFAULT_LOCALE);
  assert.equal(resolveLocale({}), DEFAULT_LOCALE);
  for (const bad of [{ search: 42 }, { languages: "en" }, { languages: [null, 42, {}] }]) {
    assert.equal(resolveLocale(bad), DEFAULT_LOCALE, `input: ${JSON.stringify(bad)}`);
  }
});

// --------------------------------------------------------------------- makeT

test("t reads the active catalogue", () => {
  assert.equal(makeT("fr", CATALOGUES)("hello"), "Bonjour");
  assert.equal(makeT("en", CATALOGUES)("hello"), "Hello");
});

test("a key missing from the active catalogue falls back to French, then to itself", () => {
  // Never a blank: a hole in the UI is invisible in review, a visible key names
  // its own bug.
  assert.equal(makeT("en", CATALOGUES)("onlyFr"), "Seulement en français");
  assert.equal(makeT("en", CATALOGUES)("nope.at.all"), "nope.at.all");
  assert.equal(makeT("fr", CATALOGUES)("nope.at.all"), "nope.at.all");
});

test("an unknown locale falls back to the default catalogue instead of emptying the UI", () => {
  assert.equal(makeT("de", CATALOGUES)("hello"), "Bonjour");
});

test("placeholders are filled, and a missing one stays visible", () => {
  const t = makeT("fr", CATALOGUES);
  assert.equal(t("greet", { name: "Alceste" }), "Bonjour Alceste");
  assert.equal(t("greet", {}), "Bonjour {name}", "not 'Bonjour undefined'");
  assert.equal(t("greet"), "Bonjour {name}");
  assert.equal(t("hello", { unused: 1 }), "Bonjour", "a template without placeholders is untouched");
});

test("a number substituted into a sentence is formatted for the locale", () => {
  // The last unlocalised typography of the site: "10307 mots" instead of
  // "10 307 mots". It is done in the engine and not at each call site for the
  // same reason plural selection is: every `{count}` here is a quantity, there
  // are a dozen of them, and one forgotten reads perfectly fine in French
  // review. A string parameter must stay untouched, which is what keeps an
  // already-formatted percentage and a roman numeral out of this.
  if (!HAS_FRENCH_DATA) return;
  // The separator is written as a code point, never as itself: French groups with
  // a NARROW no-break space (U+202F) that is indistinguishable from a plain space
  // in a source file, and this assertion has to fail when it is the wrong one.
  assert.equal(makeT("fr", CATALOGUES)("lines", { count: 10307 }), "10\u202f307 répliques");
  assert.equal(makeT("en", CATALOGUES)("lines", { count: 10307 }), "10,307 lines");
  // Small numbers are unchanged: the separator only appears where it belongs.
  assert.equal(makeT("fr", CATALOGUES)("lines", { count: 1 }), "1 réplique");
  assert.equal(makeT("fr", CATALOGUES)("lines", { count: 999 }), "999 répliques");
  // A string stays a string, verbatim: "12,4 %" must not be re-parsed, and
  // "XIV" must not become a number.
  assert.equal(makeT("fr", CATALOGUES)("greet", { name: "1234" }), "Bonjour 1234");
  assert.equal(makeT("fr", CATALOGUES)("greet", { name: "XIV" }), "Bonjour XIV");
  // Zero is a legitimate count and still substitutes (the `!= null` test, not a
  // falsy one), formatted like any other number.
  assert.equal(makeT("fr", CATALOGUES)("lines", { count: 0 }), "0 réplique");
});

test("a count of zero is singular in French and plural in English", () => {
  // The bug this engine retires. Every site used `n > 1 ? "s" : ""`, which is
  // right in French and wrong in English.
  const fr = makeT("fr", CATALOGUES);
  const en = makeT("en", CATALOGUES);
  assert.equal(fr("lines", { count: 0 }), "0 réplique");
  assert.equal(en("lines", { count: 0 }), "0 lines");
});

test("plural selection follows the count for one and many", () => {
  const fr = makeT("fr", CATALOGUES);
  const en = makeT("en", CATALOGUES);
  assert.equal(fr("lines", { count: 1 }), "1 réplique");
  assert.equal(fr("lines", { count: 2 }), "2 répliques");
  assert.equal(fr("lines", { count: 42 }), "42 répliques");
  assert.equal(en("lines", { count: 1 }), "1 line");
  assert.equal(en("lines", { count: 2 }), "2 lines");
});

test("a plural entry without a usable count renders the other form", () => {
  // Rather than throwing or picking `one` by accident. And a null count must not
  // reach the sentence as the word "null", which is what an `in` check did.
  const fr = makeT("fr", CATALOGUES);
  assert.equal(fr("lines"), "{count} répliques");
  assert.equal(fr("lines", { count: null }), "{count} répliques");
});

test("zero and the empty string still substitute, being real values", () => {
  // The guard against null must not swallow a legitimate falsy value: 0 is a
  // count the site displays constantly.
  const fr = makeT("fr", CATALOGUES);
  assert.equal(fr("lines", { count: 0 }), "0 réplique");
  assert.equal(fr("greet", { name: "" }), "Bonjour ");
});

test("a plural entry falls back to a form it does have", () => {
  // French reports a `many` category that no message here reaches, so entries
  // carry one/other only; nothing must break if a category is absent.
  const catalogues = { fr: { "x": { other: "beaucoup" }, "y": { one: "un seul" } } };
  assert.equal(makeT("fr", catalogues)("x", { count: 1 }), "beaucoup");
  assert.equal(makeT("fr", catalogues)("y", { count: 5 }), "un seul");
});

test("makeT tolerates a missing or empty catalogue set", () => {
  assert.equal(makeT("fr")("some.key"), "some.key");
  assert.equal(makeT("fr", {})("some.key"), "some.key");
});

// --------------------------------------------------------- t.parts and split

test("split cuts a template around its placeholders, in order", () => {
  // Called with no formatter, so nothing is converted: that argument is optional
  // precisely so this function stays testable without an `Intl` instance. It is
  // `t.parts` that always supplies one.
  assert.deepEqual(split("Déposer des {voices} ou le {script}", { voices: 1, script: 2 }), [
    "Déposer des ",
    1,
    " ou le ",
    2,
  ]);
});

test("split formats a number when it is handed a formatter", () => {
  if (!HAS_FRENCH_DATA) return;
  const pieces = split("avant {n} après", { n: 10307 }, new Intl.NumberFormat("fr"));
  assert.deepEqual(pieces, ["avant ", "10\u202f307", " après"]);
});

test("split preserves non-string parameters as-is, which is the whole point", () => {
  // The parameters are React nodes in real use, so they must not be stringified.
  const node = { type: "strong" };
  const pieces = split("avant {x} après", { x: node });
  assert.equal(pieces[1], node, "the very same object, not a copy or a string");
});

test("split handles placeholders at the edges without emitting empty strings", () => {
  assert.deepEqual(split("{a} milieu {b}", { a: 1, b: 2 }), [1, " milieu ", 2]);
  assert.deepEqual(split("{a}", { a: 1 }), [1]);
});

test("split leaves an unknown placeholder in the text, like interpolation does", () => {
  assert.deepEqual(split("a {x} b", {}), ["a {x} b"]);
  assert.deepEqual(split("a {x} b", { y: 1 }), ["a {x} b"]);
});

test("split returns a template with no placeholder unchanged, as one piece", () => {
  assert.deepEqual(split("rien à remplacer", { a: 1 }), ["rien à remplacer"]);
});

test("t.parts goes through the same lookup and plural rules as t", () => {
  const t = makeT("en", CATALOGUES);
  assert.deepEqual(t.parts("nope"), ["nope"], "a missing key still renders something");
  // A NUMBER is formatted here exactly as `t` formats it, and that matters: the
  // same key rendered through `t` and through `<T>` would otherwise show
  // "10,307" on one page and "10307" on the next. React nodes, the normal
  // parameter of `parts`, are still handed back untouched (the test below).
  assert.deepEqual(t.parts("rich", { voices: 1, script: 2 }), ["Drop ", "1", " or the ", "2"]);
  assert.deepEqual(t.parts("lines", { count: 0 }), ["0", " lines"]);
  assert.deepEqual(t.parts("lines", { count: 10307 }), ["10,307", " lines"]);
});

test("t.parts hands a React node back untouched, formatter or not", () => {
  // The reason `parts` exists: the parameter is a JSX element, so it must reach
  // the caller as the very same object. Only numbers are formatted.
  const node = { type: "strong" };
  const pieces = makeT("fr", CATALOGUES).parts("greet", { name: node });
  assert.equal(pieces[1], node, "the very same object, not a copy or a string");
});

// --------------------------------------------------------------- makeFormats

test("percent takes a ratio and follows the locale's decimal separator", () => {
  if (!HAS_FRENCH_DATA) return;
  const fr = makeFormats("fr").percent(0.124);
  const en = makeFormats("en").percent(0.124);
  assert.match(fr, /^12,4/, "French uses a decimal comma");
  assert.match(en, /^12\.4/, "English uses a decimal point");
});

test("the space before the French percent sign is a real no-break space", () => {
  // The code this replaces wrote an ordinary space and pinned it with `nowrap`
  // in CSS. If this assertion ever fails, that CSS belt matters again.
  if (!HAS_FRENCH_DATA) return;
  assert.ok(makeFormats("fr").percent(0.124).includes(" %"), "U+00A0 then %");
  assert.ok(!makeFormats("en").percent(0.124).includes(" "), "English has no space at all");
});

test("dateTime renders a date and a time, and the locale carries the join", () => {
  if (!HAS_FRENCH_DATA) return;
  const when = new Date(Date.UTC(2026, 6, 30, 14, 32));
  const fr = makeFormats("fr").dateTime(when);
  const en = makeFormats("en").dateTime(when);
  // Day, month and a 4-digit year in French, and no French word "à" glued in by
  // hand: the format supplies its own separator.
  assert.match(fr, /30\/07\/2026/);
  assert.ok(!fr.includes(" à "), "the join is the format's business, not ours");
  assert.match(en, /2026|26/);
  assert.notEqual(fr, en, "the two locales do not format a date the same way");
});

test("quote wraps text in the locale's own quotation marks", () => {
  // Intl does not expose CLDR quotation marks, so these are ours to carry.
  assert.equal(makeFormats("fr").quote("Bonjour"), "« Bonjour »");
  assert.equal(makeFormats("en").quote("Hello"), "“Hello”");
});

test("the invisible characters of French typography are the ones intended", () => {
  // The two assertions above read well but compare against literals holding
  // U+00A0, which is indistinguishable from a plain space in source. This one
  // spells the codepoints out, so the intent survives an editor that normalises
  // whitespace and a reviewer who cannot see it.
  const codes = (s) => [...s].map((c) => c.codePointAt(0));
  assert.deepEqual(
    codes(makeFormats("fr").quote("x")),
    [0xab, 0xa0, 0x78, 0xa0, 0xbb],
    "guillemet, no-break space, x, no-break space, guillemet"
  );
  if (!HAS_FRENCH_DATA) return;
  const percent = makeFormats("fr").percent(0.124);
  assert.equal(
    codes(percent).at(-2),
    0xa0,
    "the character before % is U+00A0, not U+0020 and not U+202F"
  );
});

test("an unknown locale still formats, falling back to the default marks", () => {
  assert.equal(makeFormats("de").quote("Hallo"), "« Hallo »");
});
