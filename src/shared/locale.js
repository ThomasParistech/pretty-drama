// The active locale of THIS document, plus the ready-made `t` and `fmt` bound to
// it. Everything with a side effect lives here so that i18n.js can stay pure and
// testable: this module reads the URL, localStorage and the navigator, and it
// runs once at import time.
//
// A module singleton rather than a React context, and that is a consequence of
// the architecture, not a shortcut: this is a multi-page site, nine separate
// documents (two above the plays, seven per play), and switching language navigates. The locale is therefore a
// per-document CONSTANT, so a context would only thread an immutable value
// through the tree. Pure modules (stats.js, reducer.js) that need words are
// handed `t` as an argument instead, which is also what keeps them testable
// under `node --test`.
import {
  askedLocale,
  isLocale,
  makeFormats,
  makeT,
  resolveLocale,
} from "./i18n.js";
import { EN } from "./locales/en.js";
import { FR } from "./locales/fr.js";

const CATALOGUES = { fr: FR, en: EN };

// The project's FIRST and only local persistence, and a deliberate exception to
// its "no local persistence" rule, which is really about WORK: a forgotten draft
// would come back as a stale source of truth against the repo. A UI language
// competes with no source of truth and costs nothing to lose.
//
// It is not optional either. Without it, `navigator.language` drags a francophone
// who picked English straight back to French on every page that loses the query
// string, and this site loses it on every single navigation: an internal link is
// a plain relative href (`./rehearsal.html`, `homeHref`), so `?lang=en` is gone
// the moment you leave the page you opened, and a bookmark or a hand-typed URL
// never had one. Remembering the choice is therefore also what lets every link
// stay exactly as it is, instead of being funnelled through a helper that any
// future link could forget.
const STORAGE_KEY = "prettydrama.lang";

// Wrapped because storage throws, not just returns null, when it is refused
// (private browsing, blocked cookies). A refused store is not an error worth
// showing: the site degrades to detection, which is the behaviour of a first
// visit.
function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Nothing to do and nothing to say: `?lang` still carries the choice for as
    // long as the URL does.
  }
}

const search = window.location.search;
const asked = askedLocale(search);

export const LOCALE = resolveLocale({
  search,
  stored: readStored(),
  languages: navigator.languages ?? [navigator.language],
});

// An explicit `?lang` is a choice, so it sticks: opening a shared English link
// once switches the site for good. That is what makes the parameter worth having
// rather than decorative, since it is the only way to hand someone a language.
if (asked) writeStored(asked);

export const t = makeT(LOCALE, CATALOGUES);
export const fmt = makeFormats(LOCALE);

// A translator bound to an EXPLICIT locale, for the rare text that belongs to the
// DOCUMENT rather than to the reader: the act and scene labels of the Editor,
// which are composed in the language of the PLAY (see structureLabels.js). Every
// other string on the site goes through `t` above.
//
// Memoized per locale, and not for elegance: `makeT` builds an Intl.PluralRules
// and an Intl.NumberFormat, and the Editor calls this on every render, so an
// unmemoized version would mint two Intl objects per keystroke. There are two
// locales, so the map holds two entries at most; the current one is seeded with
// the module's own `t`, so `translator(LOCALE) === t`.
const TRANSLATORS = new Map([[LOCALE, t]]);

export function translator(locale) {
  // An absent or unknown language falls back to the reader's locale rather than
  // to French: the caller is showing text to the reader either way, and a play
  // whose `language` is missing has said nothing about how to label it.
  const key = isLocale(locale) ? locale : LOCALE;
  let bound = TRANSLATORS.get(key);
  if (!bound) {
    bound = makeT(key, CATALOGUES);
    TRANSLATORS.set(key, bound);
  }
  return bound;
}

// The URL that switches to `locale`, used by LocaleSwitch. Returning a real href
// means the switch is two plain links: no click handler, no state, and the store
// is written by the normal page-load path above. It also stays right-clickable
// and openable in a new tab, which a button never is.
export function localeHref(locale) {
  if (!isLocale(locale)) return null;
  const url = new URL(window.location.href);
  url.searchParams.set("lang", locale);
  return url.toString();
}

// `<html lang>` and `<title>` are static in the nine HTML documents, so they are set
// here at mount. The French `<title>` in the file stays as the pre-JS fallback
// (and a CI guard keeps it in step with the French catalogue), which means a
// French reader never sees it change; an English one sees it settle a moment
// after load, the price of not duplicating the pages per locale.
export function applyDocumentLanguage(labelKey) {
  document.documentElement.lang = LOCALE;
  document.title = t("common.docTitle", { page: t(labelKey) });
}
