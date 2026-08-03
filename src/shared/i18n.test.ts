// The three locale layers, the plural categories (French and English disagree at
// zero), and a message surviving a missing key or parameter.
// Own fixtures, so a reworded UI string cannot break them; catalogue content is
// checked by parity.test.ts and test_contracts.py.
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
} from "./i18n.ts";

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

// Needs full-ICU: a minimal Node build silently resolves every locale to English.
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
  // A shared link is the only way to hand someone a language, so it beats the store,
  // which locale.ts then updates.
  assert.equal(resolveLocale({ search: "?lang=en", stored: "fr", languages: ["fr-FR"] }), "en");
  assert.equal(resolveLocale({ search: "?lang=fr", stored: "en", languages: ["en-US"] }), "fr");
  assert.equal(resolveLocale({ search: "lang=en" }), "en", "a search string without its ? still parses");
  assert.equal(resolveLocale({ search: "?a=1&lang=en&b=2" }), "en");
});

test("the stored choice beats the navigator", () => {
  // The scenario the stored layer exists for: without it, navigator.language drags a
  // deliberate English choice back to French on every navigation.
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
  // A typo in a shared link must not override a deliberate choice.
  assert.equal(resolveLocale({ search: "?lang=xx", stored: "en" }), "en");
  assert.equal(resolveLocale({ search: "?lang=", stored: "en" }), "en");
  assert.equal(resolveLocale({ search: "?lang=en-GB", stored: "en" }), "en", "?lang takes a bare locale");
  assert.equal(resolveLocale({ search: "?lang=xx", languages: ["en"] }), "en");
});

test("a corrupted stored value is ignored rather than trusted", () => {
  // localStorage can hold anything a user, an extension or an old version left.
  for (const stored of ["", "xx", "en-GB", "null", 42, null, undefined, {}]) {
    assert.equal(
      resolveLocale({ stored, languages: ["en"] }),
      "en",
      `stored: ${JSON.stringify(stored)}`
    );
  }
});

test("resolveLocale never throws, whatever it is handed", () => {
  // Runs before anything renders: a throw here is a blank page.
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
  // Never a blank: a hole is invisible in review, a visible key names its own bug.
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
  // Formatted in the ENGINE and not at each call site: one forgotten grouping reads
  // perfectly fine in review.
  if (!HAS_FRENCH_DATA) return;
  // The separator is written as a code point: French groups with a NARROW no-break
  // space (U+202F), indistinguishable from a plain one in source.
  assert.equal(makeT("fr", CATALOGUES)("lines", { count: 10307 }), "10\u202f307 répliques");
  assert.equal(makeT("en", CATALOGUES)("lines", { count: 10307 }), "10,307 lines");
  // The separator only appears where it belongs.
  assert.equal(makeT("fr", CATALOGUES)("lines", { count: 1 }), "1 réplique");
  assert.equal(makeT("fr", CATALOGUES)("lines", { count: 999 }), "999 répliques");
  // A string stays verbatim: no re-parsing "12,4 %", no turning "XIV" into a number.
  assert.equal(makeT("fr", CATALOGUES)("greet", { name: "1234" }), "Bonjour 1234");
  assert.equal(makeT("fr", CATALOGUES)("greet", { name: "XIV" }), "Bonjour XIV");
  // Zero is a legitimate count and still substitutes (`!= null`, not a falsy test).
  assert.equal(makeT("fr", CATALOGUES)("lines", { count: 0 }), "0 réplique");
});

test("a count of zero is singular in French and plural in English", () => {
  // `n > 1 ? "s" : ""` is right in French and wrong in English.
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
  // And a null count must never reach the sentence as the word "null".
  const fr = makeT("fr", CATALOGUES);
  assert.equal(fr("lines"), "{count} répliques");
  assert.equal(fr("lines", { count: null }), "{count} répliques");
});

test("zero and the empty string still substitute, being real values", () => {
  // The null guard must not swallow 0, a count the site displays constantly.
  const fr = makeT("fr", CATALOGUES);
  assert.equal(fr("lines", { count: 0 }), "0 réplique");
  assert.equal(fr("greet", { name: "" }), "Bonjour ");
});

test("a plural entry falls back to a form it does have", () => {
  // Entries carry one/other only; an absent category must not break anything.
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
  // No formatter, so nothing is converted: the argument is optional so this stays
  // testable without an `Intl` instance.
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
  // React nodes in real use, so they must not be stringified.
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
  // Formatted exactly as `t` does, or one key shows "10,307" through `<T>` and
  // "10307" through `t`.
  assert.deepEqual(t.parts("rich", { voices: 1, script: 2 }), ["Drop ", "1", " or the ", "2"]);
  assert.deepEqual(t.parts("lines", { count: 0 }), ["0", " lines"]);
  assert.deepEqual(t.parts("lines", { count: 10307 }), ["10,307", " lines"]);
});

test("t.parts hands a React node back untouched, formatter or not", () => {
  // Why `parts` exists: a JSX parameter must reach the caller as the same object.
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
  // If this fails, the `nowrap` CSS belt matters again.
  if (!HAS_FRENCH_DATA) return;
  assert.ok(makeFormats("fr").percent(0.124).includes(" %"), "U+00A0 then %");
  assert.ok(!makeFormats("en").percent(0.124).includes(" "), "English has no space at all");
});

test("dateTime renders a date and a time, and the locale carries the join", () => {
  if (!HAS_FRENCH_DATA) return;
  const when = new Date(Date.UTC(2026, 6, 30, 14, 32));
  const fr = makeFormats("fr").dateTime(when);
  const en = makeFormats("en").dateTime(when);
  // 4-digit year, and the format supplies its own date/time separator.
  assert.match(fr, /30\/07\/2026/);
  assert.ok(!fr.includes(" à "), "the join is the format's business, not ours");
  assert.match(en, /2026|26/);
  assert.notEqual(fr, en, "the two locales do not format a date the same way");
});

test("quote wraps text in the locale's own quotation marks", () => {
  // Intl does not expose CLDR quotation marks, so these are ours.
  assert.equal(makeFormats("fr").quote("Bonjour"), "« Bonjour »");
  assert.equal(makeFormats("en").quote("Hello"), "“Hello”");
});

test("the invisible characters of French typography are the ones intended", () => {
  // The literals above hold U+00A0, invisible in source: this one spells it out so
  // the intent survives an editor that normalises whitespace.
  const codes = (s: string) => [...s].map((c) => c.codePointAt(0));
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
