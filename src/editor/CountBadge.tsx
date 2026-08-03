import React from "react";
import { fmt, t } from "../shared/locale.ts";

// Line count of a character, an act or a scene. Only the figure is drawn so the column
// lines up; the sentence is in `aria-label`, which needs `role="img"` to be valid on a
// `<span>`. `fmt.number` because the label formats its number too, and "1144" on screen
// read aloud as "1,144" is the same count spelled two ways.
export default function CountBadge({ count, className }: { count: number; className?: string }) {
  const label = t("common.lineCount", { count });
  return (
    <span className={className} role="img" aria-label={label} title={label}>
      {fmt.number(count)}
    </span>
  );
}
