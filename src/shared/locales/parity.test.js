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

import { LOCALES } from "../i18n.js";
import { EN } from "./en.js";
import { FR } from "./fr.js";

const CATALOGUES = { fr: FR, en: EN };

const PLACEHOLDER = /\{(\w+)\}/g;

const placeholdersOf = (template) =>
  new Set([...String(template).matchAll(PLACEHOLDER)].map((m) => m[1]));

// Every string an entry can render: one for a plain entry, one per plural form
// otherwise.
function formsOf(entry) {
  return typeof entry === "string" ? [entry] : Object.values(entry);
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
      for (const form of ["one", "other"]) {
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
    const allowed = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
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
    const fr = placeholdersOf(formsOf(FR[key]).join(" "));
    const en = placeholdersOf(formsOf(EN[key]).join(" "));
    assert.deepEqual([...en].sort(), [...fr].sort(), `${key}: the placeholders differ`);
  }
});

test("every plural form of an entry uses the same placeholders", () => {
  // "{count} scène" against "plusieurs scènes" compiles and drops the number.
  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    for (const [key, entry] of Object.entries(catalogue)) {
      if (typeof entry === "string") continue;
      const forms = Object.entries(entry);
      const [firstName, firstForm] = forms[0];
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

// Les deux seules entrées françaises qui gardent une espace ORDINAIRE avant leur
// `:`, chacune pour une raison écrite dans fr.js : `common.docTitle` est un titre
// d'onglet (rien ne s'y coupe, et son jumeau statique dans les sept `.html`
// s'écrit pareil, ce qu'un garde CI compare), et `page.editor.desc` est reprise
// mot pour mot de l'ancien pages.js. Nommées ici plutôt que tolérées en bloc :
// une exception qui se justifie s'écrit, une exception qui se devine se multiplie.
const ORDINARY_COLON_OK = new Set(["common.docTitle", "page.editor.desc"]);

test("French keeps a no-break space before ? ! and :", () => {
  // Le pendant du test suivant. Une espace ordinaire là se voit à l'usage et
  // nulle part ailleurs : le signe passe seul à la ligne, et seulement sur
  // certaines largeurs. Le `:` est de la partie, et il devait l'être : c'est le
  // signe le plus fréquent de ces catalogues (la moitié des phrases de doc du
  // site énumèrent), donc celui qu'on oublie.
  for (const [key, entry] of Object.entries(FR)) {
    const punctuation = ORDINARY_COLON_OK.has(key) ? / [?!]/ : / [?!:]/;
    for (const form of formsOf(entry)) {
      assert.ok(
        !punctuation.test(form),
        `fr / ${key} : espace ordinaire avant « ${form
          .match(punctuation)?.[0]
          .trim()} », il faut U+00A0`
      );
    }
  }
});

test("French quotes keep a no-break space inside the guillemets", () => {
  // Même sort que la ponctuation ci-dessus, et le même angle mort : une espace
  // ordinaire laisse le guillemet fermant passer seul à la ligne. Les textes
  // citant l'utilisateur passent par `fmt.quote`, qui porte déjà l'insécable ; ce
  // test couvre les guillemets écrits DANS une entrée (un exemple de recherche,
  // le nom d'une section citée).
  for (const [key, entry] of Object.entries(FR)) {
    for (const form of formsOf(entry)) {
      assert.ok(!/« /.test(form), `fr / ${key} : espace ordinaire après « « »`);
      assert.ok(!/ »/.test(form), `fr / ${key} : espace ordinaire avant « » »`);
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
