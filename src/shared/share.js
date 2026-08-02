// How a SHARE is written, shared by the Speaking share legend and the play cards so
// the same figure never reads "0.0%" on one page and "< 0.1%" on the other.
// PURE: `t` and `fmt` are passed in (like `actLabel`), so it stays under `node --test`
// and never imports locale.js.

export function share(value, total) {
  if (!total) return 0;
  return (value * 100) / total;
}

export function formatShare(value, total, t, fmt) {
  const ratio = total ? value / total : 0;
  // A non-zero share NEVER shows "0.0%": a zero facing a count of 1 reads as a bug.
  // The threshold is formatted, not hard-coded, so the catalogue need not know the figure.
  if (ratio > 0 && ratio < 0.0005) return t("stats.shareBelow", { value: fmt.percent(0.001) });
  return fmt.percent(ratio);
}
