import React from "react";
import { fmt, t } from "../shared/locale.js";

// The line count of an object of the play: a character in the rail's "Characters"
// section, an act or a scene in its plan.
//
// **A bare number does not say what it counts.** On screen, the column of counts
// has to line up from one row to the next, so only the figure is written; it is
// the `aria-label` that carries the sentence, and without it the voice announced
// "Marie, 12" and the mouse learned nothing at all. The `role="img"` set alongside
// is what makes an `aria-label` valid on a `<span>`: it is the pattern of
// `PageMark` and of the language selector's flags, the only one in the repo.
//
// One single component for both panels, and it lives here rather than in one of
// the two: the same object rendered by two neighbouring files ends up diverging on
// the detail that matters (the plural key, or the `role`/`aria-label` pair, either
// of which says nothing without the other). Their CSS was already common
// (`.character-count, .structure-count` in editor.css), which said plainly that
// there was only one object; the two classes remain so that each panel keeps
// control of its own layout.
// The figure goes through `fmt.number`, the formatter for numbers written ALONE,
// outside any sentence. This is not a precaution: the `aria-label` right next to it
// is a sentence, so the engine already groups the number there itself, and without
// this the same count read "1144" on screen and was announced as "1,144 lines"
// aloud. Both come from the same `Intl.NumberFormat`, they can no longer diverge.
export default function CountBadge({ count, className }) {
  const label = t("common.lineCount", { count });
  return (
    <span className={className} role="img" aria-label={label} title={label}>
      {fmt.number(count)}
    </span>
  );
}
