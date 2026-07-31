import React from "react";
import { t } from "./locale.js";
import { PAGES, pageLabelKey } from "./pages.js";

// The "seal" of a page: round coloured badge carrying the page icon. It
// replaces the 🎭 emoji at the head of the shared headers, and serves as the
// thumbnail of the home cards and of the dashboard's upload buttons. It never
// carries a click itself: it is a meaning-bearing image, hence the
// role/aria-label. When it lives INSIDE a link (the link back home in the
// header foot, the page link of a doc sentence), it is the link that is
// clickable and the seal that turns decorative, see `label=""` below.
// The `page-<key>` class it sets on itself carries its colours, so it displays
// correctly everywhere, including outside a coloured header.
// `label`: to be passed when the seal does NOT designate its own page. The
// upload journal uses it for its Type column, where the mic means "Voices" and
// not "Recording": without it, a screen reader announces the page name there.
//
// `label=""` makes it DECORATIVE (aria-hidden, no more role): to be used when
// the word is already written right next to it, as on the home cards, where
// otherwise every link announces itself "Rehearsal, Rehearsal, Rehearse
// Italian-style…". An image that repeats its neighbour informs nobody, it
// doubles the length of the announcement.
export default function PageMark({ page, className = "", label }) {
  const { Icon } = PAGES[page];
  const decorative = label === "";
  return (
    <span
      className={`page-mark page-${page} ${className}`.trim()}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : (label ?? t(pageLabelKey(page)))}
      aria-hidden={decorative ? "true" : undefined}
    >
      <Icon />
    </span>
  );
}
