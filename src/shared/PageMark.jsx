import React from "react";
import { t } from "./locale.js";
import { PAGES, pageLabelKey } from "./pages.js";

// The "seal" of a page: round coloured badge carrying the page icon. Never clickable
// itself; the `page-<key>` class it sets carries its colours, so it works outside a
// coloured header too.
// `label`: pass it when the seal does NOT designate its own page (the journal's Type
// column, where the mic means "Voices"). `label=""` makes it decorative, for when the
// word is already written next to it.
// `tone`: DRAWING from `page`, COLOURS from `tone`. They part only in `HomeLink`, and
// the split is needed because the class sits on the element that reads the tokens.
export default function PageMark({ page, className = "", label, tone = page }) {
  const { Icon } = PAGES[page];
  const decorative = label === "";
  return (
    <span
      className={`page-mark page-${tone} ${className}`.trim()}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : (label ?? t(pageLabelKey(page)))}
      aria-hidden={decorative ? "true" : undefined}
    >
      <Icon />
    </span>
  );
}
