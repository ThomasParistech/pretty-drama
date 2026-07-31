import React from "react";
import { LOCALES } from "./i18n.js";
import { FlagIcon } from "./icons.jsx";
import { LOCALE, localeHref, t } from "./locale.js";

// The language switch, and the only place on the site where the language of the
// INTERFACE is chosen.
//
// It lives in the footer of the two home pages and NOWHERE else. A language is a
// site setting, not a page setting, so it is set on the way in; and the shared
// play header has no room for it, its foot being a finished composition (the seal
// alone and centred, framed by two short rules that close the header like a
// tailpiece closes a page). Putting a second object there breaks that centring,
// and on a line of its own it would give the header a third paragraph where the
// doctrine allows two.
//
// Two plain links, no click handler and no state: the href carries `?lang=`, and
// locale.js writes it to the store on the next page load. So the switch is also
// right-clickable and openable in a new tab, which a button never is.
//
// **Flags, not the "FR" / "EN" letter pairs this used to show.** A flag names a
// country and not a language, which stays true, so the language name travels
// with it: as `title`, and as the accessible name of the link (the flag itself
// is `aria-hidden`, and the current one is an `role="img"` span, the pattern of
// `PageMark` and of the plan's count badges). What one gains for that caveat is
// that the switch is now found without being read, by someone who does not read
// the language the page is currently in, which is exactly who this control is
// for. Endonyms would have done the same job for a reader ("Français" stays
// "Français" in an English UI, and someone hunting for their own language hunts
// for their own word for it), but two words in a footer read as a sentence,
// where two flags read as a switch.
//
// Drawn in SVG and never the flag emoji: Windows renders none of the regional
// indicators and prints the two letters instead, which would silently put the
// old design back on half the troupe's machines. See `FlagIcon`.
//
// The play-language control in the editor's Structure panel now shows the same
// flags, but it remains a different act and must not be merged with this one:
// here one picks the language one reads in, and the choice is a link that
// reloads the site; there one states a fact about a document, and the choice is
// a form field that edits the play.
const NAMES = { fr: "Français", en: "English" };

export default function LocaleSwitch() {
  return (
    <nav className="locale-switch" aria-label={t("common.language")}>
      {LOCALES.map((locale) =>
        locale === LOCALE ? (
          // The current language is not a link: there is nowhere to go. `lang`
          // tells a screen reader to pronounce the label in that language.
          <span
            key={locale}
            className="locale-switch-current"
            lang={locale}
            aria-current="true"
            // The flag being `aria-hidden`, it is this pair that carries the
            // language name: `role="img"` is what makes an `aria-label` valid
            // on a `<span>` (the pattern of the seal and of the plan's counts).
            role="img"
            aria-label={NAMES[locale]}
            title={NAMES[locale]}
          >
            <FlagIcon locale={locale} />
          </span>
        ) : (
          <a
            key={locale}
            className="locale-switch-link"
            href={localeHref(locale)}
            lang={locale}
            // The visible content is an image, so the accessible name spells
            // the language out.
            aria-label={NAMES[locale]}
            title={NAMES[locale]}
          >
            <FlagIcon locale={locale} />
          </a>
        )
      )}
    </nav>
  );
}
