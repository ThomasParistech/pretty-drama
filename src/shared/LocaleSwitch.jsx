import React from "react";
import { LOCALES } from "./i18n.js";
import { FlagIcon } from "./icons.jsx";
import { LOCALE, localeHref, t } from "./locale.js";

// The only place the INTERFACE language is chosen, in the footer of the four pages
// with a brand hero (a language is a site setting, picked on the way in).
// Plain links, no state: the href carries `?lang=` and locale.js stores it on the next
// load, so the switch is right-clickable and openable in a new tab.
// Flags so the control is found without being read, by someone who cannot read the
// current language. SVG and never the flag emoji: Windows renders regional indicators
// as the two letters. See `FlagIcon`.
// Not to be merged with the editor's play-language field: here you pick what you read,
// there you state a fact about a document.
const NAMES = { fr: "Français", en: "English" };

export default function LocaleSwitch() {
  return (
    <nav className="locale-switch" aria-label={t("common.language")}>
      {LOCALES.map((locale) =>
        locale === LOCALE ? (
          // The current language is not a link: nowhere to go.
          <span
            key={locale}
            className="locale-switch-current"
            lang={locale}
            aria-current="true"
            // The flag is aria-hidden, so this pair carries the name; `role="img"`
            // is what makes `aria-label` valid on a `<span>`.
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
