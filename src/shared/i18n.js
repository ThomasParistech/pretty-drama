// The UI translation engine.
//
// PURE on purpose: no React, no DOM, no storage, no imports at all. Everything
// it needs is passed in. That is what lets `node --test` cover the policy (which
// locale wins, how a plural is picked, how a placeholder is filled) without a
// browser and without a test dependency, the same bargain the other pure modules
// of this project make (stats.js, reducer.js, search.js).
//
// The environment-facing half lives in locale.js, which reads the URL, the
// stored choice and the navigator, then calls in here once per document.
//
// Not an ICU MessageFormat implementation, and not trying to be. ICU is the
// industry standard and a real library would be the answer for five languages or
// an outside translator; for two locales and ~270 short strings the platform
// already carries the only genuinely hard parts (plural categories, number and
// date formatting) in `Intl`, and this module is the thin seam over it.

export const DEFAULT_LOCALE = "fr";
export const LOCALES = ["fr", "en"];

// Typographic quotation marks, which `Intl` does NOT expose (CLDR has them, the
// ECMA-402 surface does not). French wants no-break spaces INSIDE the
// guillemets, English wants plain curly quotes and no spacing at all.
const QUOTES = {
  fr: { open: "« ", close: " »" },
  en: { open: "“", close: "”" },
};

const PLACEHOLDER = /\{(\w+)\}/g;

export function isLocale(value) {
  return typeof value === "string" && LOCALES.includes(value);
}

// "en-GB" -> "en". A stored or asked-for value is already a bare locale; a
// navigator tag usually is not.
function baseTag(tag) {
  return typeof tag === "string" ? tag.toLowerCase().split("-")[0] : null;
}

// The locale explicitly asked for in a query string, or null. Exported because
// locale.js needs to know whether the value came from the URL: an explicit ask
// is a choice, so it gets remembered, whereas a detected one must not be.
export function askedLocale(search) {
  if (typeof search !== "string" || search === "") return null;
  const asked = new URLSearchParams(search).get("lang");
  return isLocale(asked) ? asked : null;
}

// The three layers, in priority order, and the whole locale policy of the site.
//
// An explicit `?lang=` wins so a link can carry a language (locale.js also
// WRITES it to the stored choice, so opening such a link once switches the site
// for good). The stored choice comes next, and it is the layer that makes the
// feature usable at all: without it, a francophone who picks English is dragged
// back to French by their own navigator on every page that loses the parameter,
// and this site loses it on every navigation (internal links are plain relative
// hrefs, and a bookmark or a hand-typed URL never had one). The navigator
// therefore only ever decides the
// FIRST visit, when there is nothing remembered yet, which is exactly where it
// is right: a troupe that forks this repo should not have to find a switch to
// read its own site.
//
// An unknown `?lang=xx` falls through to the NEXT layer rather than straight to
// French: a typo in a shared link should not override a deliberate choice.
export function resolveLocale({ search, stored, languages } = {}) {
  const asked = askedLocale(search);
  if (asked) return asked;
  if (isLocale(stored)) return stored;
  if (Array.isArray(languages)) {
    for (const tag of languages) {
      const base = baseTag(tag);
      if (isLocale(base)) return base;
    }
  }
  return DEFAULT_LOCALE;
}

// A catalogue entry is either a plain string, or an object of plural forms keyed
// by CLDR category: { one, other, many? }.
//
// Verified against CLDR: French reports the categories one/many/other and
// English one/other, and `many` only ever fires in French from 1e6 upwards, a
// figure no message on this site reaches. Entries therefore carry `one` and
// `other`, `many` stays allowed but optional, and anything unlisted falls back
// to `other`. The parity test enforces exactly that, and deliberately does NOT
// demand the full category set of each language.
//
// The count drives selection through `params.count`. Note this is where an old
// bug dies: every hand-rolled site used `n > 1 ? "s" : ""`, so zero rendered
// singular. That is right in French (select(0) === "one", "0 réplique") and
// wrong in English ("0 replies"). Intl.PluralRules knows the difference.
function selectForm(entry, params, plural) {
  if (entry == null || typeof entry === "string") return entry;
  const count = params?.count;
  const category = typeof count === "number" ? plural.select(count) : "other";
  return entry[category] ?? entry.other ?? entry.one ?? null;
}

// A missing placeholder is left VISIBLE as `{name}` rather than printed as
// "undefined": both are bugs, but one of them says which parameter is missing
// and survives a screenshot.
//
// "Missing" is tested with `!= null` and not with `in`, so a parameter present
// but null or undefined counts as absent. Otherwise a `{ count: null }` reaching
// here rendered the literal string "null" into the sentence. Falsy but real
// values (0, "") still substitute, which matters: 0 is a legitimate count.
function has(params, name) {
  return params != null && params[name] != null;
}

// A NUMBER substituted into a sentence is formatted for the locale, never
// stringified raw. This is where "10307 mots" became "10 307 mots" in French and
// "10,307 words" in English, and it belongs here rather than at each call site
// for the same reason plural selection does: every `{count}` on the site is a
// quantity, there are a dozen of them, and one forgotten is invisible in French
// review. The engine already holds the locale, so it costs one line.
//
// Only numbers. A string parameter is passed through untouched, which is what
// keeps `stats.shareBelow` (already formatted by `fmt.percent`) and the roman
// numeral of `structure.act` out of this.
function substitute(value, number) {
  return typeof value === "number" ? number.format(value) : String(value);
}

function interpolate(template, params, number) {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name) =>
    has(params, name) ? substitute(params[name], number) : whole
  );
}

// `catalogues` is a parameter so this module imports nothing and the tests can
// pass their own fixtures. locale.js supplies the real ones.
//
// A key missing from the active catalogue falls back to the default locale, then
// to the key itself. Never a blank: a hole in the UI is invisible in review,
// whereas a stray `recorder.status.todo` on screen names its own bug. The CI
// guard in scripts/tests/test_contracts.py is what keeps that from shipping.
export function makeT(locale, catalogues) {
  const active = catalogues?.[locale] ?? catalogues?.[DEFAULT_LOCALE] ?? {};
  const fallback = catalogues?.[DEFAULT_LOCALE] ?? {};
  const plural = new Intl.PluralRules(locale);
  const number = new Intl.NumberFormat(locale);

  function template(key, params) {
    return selectForm(active[key] ?? fallback[key], params, plural);
  }

  function t(key, params) {
    const found = template(key, params);
    return found == null ? key : interpolate(found, params, number);
  }

  // Same lookup, but the parameters may be React nodes: returns the message cut
  // into an array of pieces instead of a string. Sentences on this site
  // regularly carry a <strong>, a <code>, an icon or a colour-bearing <span>
  // mid-phrase, and the alternative (splitting the sentence into fragments in
  // the JSX) hard-codes French word order into the component. Here the
  // translator keeps the word order and the component keeps the markup.
  //
  // No React import: this returns a plain array and T.jsx is what keys it.
  t.parts = function parts(key, params) {
    const found = template(key, params);
    return found == null ? [key] : split(found, params, number);
  };

  return t;
}

// `number` is optional here: a React node is the normal parameter of `t.parts`,
// so this path rarely sees a raw number. It formats one anyway when it does, so
// the two substitution paths cannot disagree on what "1144" looks like.
export function split(template, params, number) {
  const out = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!has(params, name)) continue;
    if (match.index > last) out.push(template.slice(last, match.index));
    const value = params[name];
    out.push(number && typeof value === "number" ? number.format(value) : value);
    last = match.index + match[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}

// Number, date and quote formatting, all locale-driven.
//
// This replaces hand-rolled French typography in two places. `formatShare` in
// stats/App.jsx built the decimal comma with a `.replace(".", ",")` and put an
// ORDINARY space before the percent sign (with `nowrap` in CSS to stop it
// breaking); Intl produces a real U+00A0 there, so the CSS belt is now
// redundant. `formatWhen` in dashboard/App.jsx pinned "fr-FR" and joined date
// and time with the French word "à"; the locale format carries that join itself.
export function makeFormats(locale) {
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  // Composants explicites plutôt que `dateStyle`/`timeStyle: "short"`, et c'est
  // une règle du journal, pas une préférence : « un journal se relit des mois
  // plus tard », donc l'année s'écrit en entier. Le style court la rendait sur
  // DEUX chiffres en anglais (« 7/27/26 »). L'heure reste en 2 chiffres et le
  // séparateur date/heure appartient à la locale, ce qui est tout l'intérêt
  // (l'ancien code collait un « à » français à la main).
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const marks = QUOTES[locale] ?? QUOTES[DEFAULT_LOCALE];
  // Le séparateur de milliers, pour les nombres qu'un composant écrit SEUL, hors
  // de toute phrase : le total au centre de l'anneau et les décomptes de la
  // légende de la Répartition. Ceux qui vivent dans une phrase n'en ont pas
  // besoin, `makeT` formatant déjà tout paramètre numérique ; c'est le même
  // formateur des deux côtés, donc les deux ne peuvent pas se désaccorder.
  const number = new Intl.NumberFormat(locale);

  return {
    number: (n) => number.format(n),
    // Takes a RATIO (0.124), not a percentage: Intl wants the fraction, and
    // handing it 12.4 would silently render "1 240 %".
    percent: (ratio) => percent.format(ratio),
    dateTime: (date) => dateTime.format(date),
    quote: (text) => `${marks.open}${text}${marks.close}`,
  };
}
