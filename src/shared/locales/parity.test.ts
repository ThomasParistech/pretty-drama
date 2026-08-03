// Tests that hold the catalogues to each other.
//
// None of this can be re-read by eye: a key added to French and forgotten in
// English degrades silently (the engine falls back, so an English page quietly
// shows a French sentence), and a `{count}` lost in translation shows a literal
// "{count}" only on the code path that renders it.
//
// This file checks the catalogues against EACH OTHER, never against expected
// text: asserting on wording would mean editing a test every time a sentence is
// reworded, which trains people to update tests without reading them.
import test from "node:test";
import assert from "node:assert/strict";

import { LOCALES } from "../i18n.ts";
import { EN } from "./en.ts";
import { FR } from "./fr.ts";
import type { Message } from "../types.ts";

const CATALOGUES = { fr: FR, en: EN };

const PLACEHOLDER = /\{(\w+)\}/g;

const placeholdersOf = (template: unknown) =>
  new Set([...String(template).matchAll(PLACEHOLDER)].map((m) => m[1]));

// Every string an entry can render: one for a plain entry, one per plural form
// otherwise.
function formsOf(entry: Message): string[] {
  return typeof entry === "string"
    ? [entry]
    : Object.values(entry).filter((form): form is string => form !== undefined);
}

test("every declared locale has a catalogue, and every catalogue is declared", () => {
  // Otherwise LocaleSwitch offers a language that resolves to the fallback, which
  // looks like a broken switch rather than a missing translation.
  assert.deepEqual(Object.keys(CATALOGUES).sort(), [...LOCALES].sort());
});

test("the catalogues carry exactly the same keys", () => {
  const fr = new Set(Object.keys(FR));
  const en = new Set(Object.keys(EN));
  const missingInEn = [...fr].filter((k) => !en.has(k));
  const missingInFr = [...en].filter((k) => !fr.has(k));
  assert.deepEqual(missingInEn, [], "keys present in French and missing in English");
  assert.deepEqual(missingInFr, [], "keys present in English and missing in French");
});

test("no catalogue is empty, and no key is blank", () => {
  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    assert.ok(Object.keys(catalogue).length > 0, `${locale} is empty`);
    for (const [key, entry] of Object.entries(catalogue)) {
      for (const form of formsOf(entry)) {
        assert.equal(typeof form, "string", `${locale} / ${key}: a form must be a string`);
        assert.notEqual(form.trim(), "", `${locale} / ${key} is blank`);
      }
    }
  }
});

test("a key is a plural entry in both catalogues or in neither", () => {
  // A plural entry in one language and a plain string in the other means one of
  // the two ignores the count.
  for (const key of Object.keys(FR)) {
    assert.equal(
      typeof FR[key] === "string",
      typeof EN[key] === "string",
      `${key}: plural on one side only`
    );
  }
});

test("a plural entry carries at least the one and other forms", () => {
  // Deliberately NOT the full category set of each language: CLDR gives French
  // one/many/other, and `many` only fires from 1e6 upwards, a figure no message
  // on this site reaches. Extra categories stay allowed, missing ones fall back
  // to `other` in the engine, but a plural entry without both of these is simply
  // not pluralised.
  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    for (const [key, entry] of Object.entries(catalogue)) {
      if (typeof entry === "string") continue;
      for (const form of ["one", "other"] as const) {
        assert.equal(
          typeof entry[form],
          "string",
          `${locale} / ${key}: missing the "${form}" form`
        );
      }
    }
  }
});

test("a plural entry only uses categories the language actually has", () => {
  // Catches a typo like `others` or `many` written into English, which would sit
  // there being silently ignored.
  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    const allowed = new Set<string>(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
    for (const [key, entry] of Object.entries(catalogue)) {
      if (typeof entry === "string") continue;
      for (const category of Object.keys(entry)) {
        assert.ok(allowed.has(category), `${locale} / ${key}: unknown plural category "${category}"`);
      }
    }
  }
});

test("both languages of a key use the same placeholders", () => {
  // THE test of this file. A `{count}` or a `{name}` lost in translation renders
  // as literal braces, and only on the path that shows that one message.
  for (const key of Object.keys(FR)) {
    const fr = placeholdersOf(formsOf(FR[key]!).join(" "));
    const en = placeholdersOf(formsOf(EN[key]!).join(" "));
    assert.deepEqual([...en].sort(), [...fr].sort(), `${key}: the placeholders differ`);
  }
});

test("every plural form of an entry uses the same placeholders", () => {
  // "{count} scène" against "plusieurs scènes" compiles and drops the number.
  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    for (const [key, entry] of Object.entries(catalogue)) {
      if (typeof entry === "string") continue;
      const forms = Object.entries(entry);
      const [firstName, firstForm] = forms[0]!;
      const expected = [...placeholdersOf(firstForm)].sort();
      for (const [name, form] of forms.slice(1)) {
        assert.deepEqual(
          [...placeholdersOf(form)].sort(),
          expected,
          `${locale} / ${key}: "${name}" and "${firstName}" do not carry the same placeholders`
        );
      }
    }
  }
});

test("no entry carries an em dash, in either language", () => {
  // A repo-wide writing rule, and it applies to the English catalogue too: use a
  // colon, a semicolon, a comma, brackets, or one more sentence.
  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    for (const [key, entry] of Object.entries(catalogue)) {
      for (const form of formsOf(entry)) {
        assert.ok(!form.includes("—"), `${locale} / ${key} carries an em dash`);
      }
    }
  }
});

// The only two French entries that keep an ORDINARY space before their `:`, each
// for a reason written down in fr.ts: `common.docTitle` is a tab title (nothing
// wraps in it, and its static twin in the nine `.html` documents is written the same
// way, which a CI guard compares), and `page.editor.desc` is taken word for word
// from the old pages.ts. Named here rather than tolerated wholesale: an exception
// that can be justified gets written down, an exception left to be guessed
// multiplies.
const ORDINARY_COLON_OK = new Set(["common.docTitle", "page.editor.desc"]);

test("French keeps a no-break space before ? ! and :", () => {
  // The counterpart of the next test. An ordinary space there shows up in use and
  // nowhere else: the sign wraps to the next line on its own, and only at certain
  // widths. The `:` is part of it, and it had to be: it is the most frequent sign
  // in these catalogues (half the site's doc sentences enumerate something),
  // hence the one that gets forgotten.
  for (const [key, entry] of Object.entries(FR)) {
    const punctuation = ORDINARY_COLON_OK.has(key) ? / [?!]/ : / [?!:]/;
    for (const form of formsOf(entry)) {
      assert.ok(
        !punctuation.test(form),
        `fr / ${key}: ordinary space before "${form
          .match(punctuation)?.[0]
          .trim()}", U+00A0 is required`
      );
    }
  }
});

test("French quotes keep a no-break space inside the guillemets", () => {
  // Same fate as the punctuation above, and the same blind spot: an ordinary
  // space lets the closing guillemet wrap to the next line on its own. Texts
  // quoting the user go through `fmt.quote`, which already carries the no-break
  // space; this test covers the guillemets written INSIDE an entry (a search
  // example, the name of a section being quoted).
  for (const [key, entry] of Object.entries(FR)) {
    for (const form of formsOf(entry)) {
      assert.ok(!/« /.test(form), `fr / ${key}: ordinary space after "«"`);
      assert.ok(!/ »/.test(form), `fr / ${key}: ordinary space before "»"`);
    }
  }
});

test("English carries no French typography", () => {
  // The space before ? ! and :, and the guillemets, are facts of French. They
  // reach English only by a copy-paste that was never re-read.
  for (const [key, entry] of Object.entries(EN)) {
    for (const form of formsOf(entry)) {
      assert.ok(!form.includes("«") && !form.includes("»"), `en / ${key}: guillemets`);
      assert.ok(!/ [?!:;]/.test(form), `en / ${key}: no-break space before punctuation`);
    }
  }
});
