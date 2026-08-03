// The active locale of THIS document plus `t`/`fmt` bound to it. Every side effect
// lives here (URL, localStorage, navigator, all read at import time) so i18n.ts stays
// pure. Hence: a module under `node --test` never imports this file.
// A module singleton, not a React context: multi-page site, the locale is a
// per-document constant and switching language navigates. Pure modules take `t` as an
// argument instead.
import {
  askedLocale,
  isLocale,
  makeFormats,
  makeT,
  resolveLocale,
} from "./i18n.ts";
import type { Locale, Translate } from "./types.ts";
import { EN } from "./locales/en.ts";
import { FR } from "./locales/fr.ts";

const CATALOGUES = { fr: FR, en: EN };

// The only local persistence on the site, and the exception to the "no persistence"
// rule, which is about WORK. Required: internal links are bare relative hrefs, so
// `?lang=` dies on every navigation and detection would drag the reader back.
const STORAGE_KEY = "prettydrama.lang";

// Storage THROWS, not just returns null, when refused (private browsing, blocked
// cookies). Degrade to detection, which is the first-visit behaviour.
function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(locale: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Nothing to say: `?lang` still carries the choice as long as the URL does.
  }
}

const search = window.location.search;
const asked = askedLocale(search);

export const LOCALE = resolveLocale({
  search,
  stored: readStored(),
  languages: navigator.languages ?? [navigator.language],
});

// An explicit `?lang` is a choice, so it sticks: it is the only way to hand someone
// a language.
if (asked) writeStored(asked);

export const t = makeT(LOCALE, CATALOGUES);
export const fmt = makeFormats(LOCALE);

// A translator bound to an EXPLICIT locale, for text belonging to the DOCUMENT rather
// than the reader: the Editor's act and scene labels (structureLabels.ts).
// Memoized because `makeT` builds two Intl objects and the Editor calls this on every
// render. Seeded with `t`, so `translator(LOCALE) === t`.
const TRANSLATORS = new Map<Locale, Translate>([[LOCALE, t]]);

export function translator(locale: unknown): Translate {
  // An unknown language falls back to the READER's locale, not to French: a play that
  // said nothing about its language said nothing about how to label it.
  const key = isLocale(locale) ? locale : LOCALE;
  let bound = TRANSLATORS.get(key);
  if (!bound) {
    bound = makeT(key, CATALOGUES);
    TRANSLATORS.set(key, bound);
  }
  return bound;
}

// Date of an upload, null on an unreadable timestamp rather than "Invalid Date", which
// the callers word themselves. Here and not in data.ts: that module is under
// `node --test` and must not import this one.
export function formatWhen(iso: string): string | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return fmt.dateTime(then);
}

// A real href, so LocaleSwitch is two plain links: no handler, no state, and the
// store is written by the normal page-load path above.
export function localeHref(locale: unknown): string | null {
  if (!isLocale(locale)) return null;
  const url = new URL(window.location.href);
  url.searchParams.set("lang", locale);
  return url.toString();
}

// `<html lang>` and `<title>` are static French in the nine documents, the pre-JS
// fallback (a CI guard keeps it in step with the catalogue); set for real here.
export function applyDocumentLanguage(labelKey: string): void {
  document.documentElement.lang = LOCALE;
  document.title = t("common.docTitle", { page: t(labelKey) });
}
