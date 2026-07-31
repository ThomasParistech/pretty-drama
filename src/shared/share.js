// How a SHARE is written, and the threshold that stops it from lying.
//
// Shared since two pages write one: the Speaking share legend, and a play's card on
// the two root pages ("12.4% recorded"). It is the same measure and the same
// rounding rule, hence the same implementation: duplicating it would have left one
// page saying "0.0%" where the other says "< 0.1%", on the very same figure.
//
// A PURE module: `t` and `fmt` are PASSED IN, as they are to `actLabel`, so it stays
// covered by `node --test` and cannot import `locale.js`, which reads the URL and
// the navigator.

// The share as a percentage. Returned by this module rather than computed in the
// JSX: it is the page's only division, and "0%" on a non-zero share would read
// like a bug (see `formatShare`, which takes care of that).
export function share(value, total) {
  if (!total) return 0;
  return (value * 100) / total;
}

// The share as it is written in a legend: one digit after the decimal point, like
// the `%1.1f%%` of the reference.
//
// Here and not in the JSX, like everything that can be got wrong: the threshold
// below is a rule, not a drawing, so `node --test` replays it. `t` and `fmt` are
// PASSED IN, as they are to `actLabel`: this module stays pure, hence testable
// without a DOM.
//
// The decimal comma and the space before the sign are no longer written by hand:
// `Intl.NumberFormat` holds them, and it holds them BETTER. The previous code did a
// `.replace(".", ",")` and laid an ORDINARY space before the `%`, which
// `.stats-legend-share { white-space: nowrap }` had to make up for; Intl produces a
// real U+00A0 no-break space in French and nothing at all in English ("12.4%").
// The `nowrap` therefore becomes one more belt, kept and without effect.
export function formatShare(value, total, t, fmt) {
  const ratio = total ? value / total : 0;
  // A non-zero share NEVER shows "0.0%": one word out of the play's ten thousand
  // fell there, and a zero facing a count of 1 reads like a rounding bug, which
  // is precisely what the comment on `share` wants to avoid. Below a tenth of a
  // point, we state the threshold and not the value.
  //
  // The threshold itself is FORMATTED and not hard-coded: "< 0,1 %" in French,
  // "< 0.1%" in English, without a catalogue having to know the figure.
  if (ratio > 0 && ratio < 0.0005) return t("stats.shareBelow", { value: fmt.percent(0.001) });
  return fmt.percent(ratio);
}
