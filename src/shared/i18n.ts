import type { Catalogue, Formats, Locale, Message, TParams, Translate } from "./types.ts";

// The UI translation engine. PURE: no React, no DOM, no storage, no imports, so
// `node --test` covers the policy. The environment-facing half is locale.ts.
// Not ICU and not trying to be: for two locales and ~270 strings `Intl` already
// carries the hard parts and this is the thin seam over it.

export const DEFAULT_LOCALE = "fr";
export const LOCALES = ["fr", "en"];

// `Intl` does NOT expose quotation marks (CLDR has them, ECMA-402 does not).
const QUOTES: Record<string, { open: string; close: string }> = {
  fr: { open: "« ", close: " »" },
  en: { open: "“", close: "”" },
};

const PLACEHOLDER = /\{(\w+)\}/g;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value);
}

// "en-GB" -> "en": a navigator tag is usually not bare.
function baseTag(tag: unknown): string | null {
  return typeof tag === "string" ? tag.toLowerCase().split("-")[0] : null;
}

// Exported because locale.ts must know the value came from the URL: an explicit ask
// is a choice and gets remembered, a detected one must not be.
export function askedLocale(search: unknown): Locale | null {
  if (typeof search !== "string" || search === "") return null;
  const asked = new URLSearchParams(search).get("lang");
  return isLocale(asked) ? asked : null;
}

// The whole locale policy: explicit `?lang=`, then the stored choice, then the
// navigator (first visit only). An unknown `?lang=xx` falls through to the NEXT layer
// and not straight to French: a typo in a shared link must not override a choice.
export function resolveLocale(
  {
    search,
    stored,
    languages,
  }: { search?: unknown; stored?: unknown; languages?: unknown } = {}
): Locale {
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

// A catalogue entry is a string or `{ one, other, many? }` keyed by CLDR category.
// French `many` only fires from 1e6, which no message here reaches, so entries carry
// one/other and anything unlisted falls back to `other`.
// Selection is driven by `params.count`, which is why zero is singular in French
// ("0 réplique") and plural in English ("0 replies").
function selectForm(
  entry: Message | undefined,
  params: Record<string, unknown> | undefined,
  plural: Intl.PluralRules
): string | null {
  if (entry == null || typeof entry === "string") return entry ?? null;
  const count = params?.count;
  const category = typeof count === "number" ? plural.select(count) : "other";
  return entry[category] ?? entry.other ?? entry.one ?? null;
}

// A missing placeholder stays VISIBLE as `{name}` rather than printing "undefined":
// it names its own bug. `!= null` and not `in`, so `{ count: null }` does not render
// the string "null"; 0 and "" still substitute.
function has(params: Record<string, unknown> | undefined | null, name: string): boolean {
  return params != null && params[name] != null;
}

// A NUMBER in a sentence is formatted for the locale here and never at the call site:
// one forgotten grouping is invisible in review. Strings pass through untouched, which
// keeps `stats.shareBelow` and the roman numeral of `structure.act` out of it.
function substitute(value: unknown, number: Intl.NumberFormat): string {
  return typeof value === "number" ? number.format(value) : String(value);
}

function interpolate(
  template: string,
  params: Record<string, unknown> | undefined,
  number: Intl.NumberFormat
): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name) =>
    has(params, name) ? substitute(params![name], number) : whole
  );
}

// `catalogues` is a parameter so this module imports nothing.
// A missing key falls back to the default locale then to THE KEY ITSELF, never a
// blank: a hole is invisible in review, a stray `recorder.status.todo` names its bug.
export function makeT(
  locale: string,
  catalogues?: Partial<Record<string, Catalogue>>
): Translate {
  const active = catalogues?.[locale] ?? catalogues?.[DEFAULT_LOCALE] ?? {};
  const fallback = catalogues?.[DEFAULT_LOCALE] ?? {};
  const plural = new Intl.PluralRules(locale);
  const number = new Intl.NumberFormat(locale);

  function template(key: string, params?: Record<string, unknown>): string | null {
    return selectForm(active[key] ?? fallback[key], params, plural);
  }

  function t(key: string, params?: TParams): string {
    const found = template(key, params);
    return found == null ? key : interpolate(found, params, number);
  }

  // Same lookup with React nodes as parameters: returns the message cut into pieces
  // so markup mid-sentence does not freeze French word order. No React import here,
  // T.tsx keys the array.
  t.parts = function parts(key: string, params?: Record<string, unknown>): unknown[] {
    const found = template(key, params);
    return found == null ? [key] : split(found, params, number);
  };

  return t;
}

// `number` is optional but honoured, so the two substitution paths cannot disagree
// on what "1144" looks like.
export function split(
  template: string,
  params?: Record<string, unknown>,
  number?: Intl.NumberFormat
): unknown[] {
  const out: unknown[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!has(params, name)) continue;
    if (match.index > last) out.push(template.slice(last, match.index));
    const value = params![name];
    out.push(number && typeof value === "number" ? number.format(value) : value);
    last = match.index + match[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}

// Number, date and quote formatting, all locale-driven. French typography (the
// U+00A0 before `%`, the date/time join) comes from Intl and is never written by hand.
export function makeFormats(locale: string): Formats {
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  // Explicit components and not `dateStyle: "short"`, which rendered the year on TWO
  // digits in English: a log is read back months later, so the year is written out.
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const marks = QUOTES[locale] ?? QUOTES[DEFAULT_LOCALE];
  // For numbers a component writes ALONE, outside any sentence. Same formatter as
  // `makeT` uses inside one, so the two cannot disagree.
  const number = new Intl.NumberFormat(locale);

  // Joining an ENUMERATION of translated phrases (the journal's script row). How a
  // language strings a list is a fact of that language, never a `", "` in a component.
  // `type: "unit"` and not `"conjunction"`, which adds an English ", and" that turns a
  // row of measurements into a sentence; `style: "narrow"` drops the French commas
  // altogether. Both measured.
  const list = new Intl.ListFormat(locale, { type: "unit" });

  return {
    number: (n: number) => number.format(n),
    list: (parts: string[]) => list.format(parts),
    // A RATIO (0.124), not a percentage: 12.4 silently renders "1 240 %".
    percent: (ratio: number) => percent.format(ratio),
    dateTime: (date: Date | number) => dateTime.format(date),
    quote: (text: string) => `${marks.open}${text}${marks.close}`,
  };
}
