// A character's colour: the palette, how it is assigned, and the only derivation
// we make from it. A PURE module (no React, no DOM, no reducer), hence entirely
// replayed by `node --test` (see characterColors.test.js).
//
// **Where the palette comes from.** It is Tableau 10, the canonical categorical
// palette: `tab10` under matplotlib, `schemeCategory10` under D3. The troupe's
// original visualisation (theatre_transport_de_femme repository,
// `viz/generate_viz.py`) used `sns.color_palette("bright", 10)`, which is not
// another palette but another REGISTER of this one: seaborn's six variants (deep,
// muted, pastel, bright, dark, colorblind) have the same ten slots in the same
// order (blue, orange, green, red, purple, brown, pink, grey, olive, cyan) and
// differ only in saturation and lightness. We keep the canonical register because
// it separates its own colours BETTER than `bright` does (minimum gap of ΔE 27.7
// against 24.8) while being less garish: `bright` pays for its lightness range by
// dropping its yellow to 1.48:1 on the site's cream, which passes for a pie slice
// but not for a legend swatch.
//
// **Why the previous palette could not serve.** It returned
// `oklch(0.58 0.14 H)`, hence at FIXED lightness: its twelve colours differed
// only by hue, i.e. an L* range of 6 points and a minimum gap of ΔE 15.9. On a
// block of one pixel per word (Speaking share page), two neighbours blended into
// each other. Varying lightness is what does the work, not hue.
//
// **The first ten, then the ten light ones.** `tab20` is the official extension
// of the same palette, and its even entries ARE `tab10` identically. Hence the
// order below: any troupe up to ten characters gets Tableau 10 at full strength
// and never sees a pale tint, and each light one stays plainly distinct from its
// dark counterpart (ΔE 22 to 46), so blue never reads as light blue. Beyond ten
// the set weakens (ΔE 16.6), beyond twenty it loops: bounded degradation, and
// only a troupe larger than today's pays for it.
//
// **The colour is stored, it is no longer a hue.** The character carries
// `color: "#1f77b4"` in script.json. A hue could not index this palette:
// `#ff7f0e` and `#8c564b` are two registers of the same angle, and `#7f7f7f` has
// no angle at all.
export const CHARACTER_COLORS = [
  // Tableau 10, in its own order.
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#7f7f7f", // grey
  "#bcbd22", // olive
  "#17becf", // cyan
  // The ten light ones from tab20, in the same hue order.
  "#aec7e8",
  "#ffbb78",
  "#98df8a",
  "#ff9896",
  "#c5b0d5",
  "#c49c94",
  "#f7b6d2",
  "#c7c7c7",
  "#dbdb8d",
  "#9edae5",
];

// The catalogue KEY of each colour, in the order of `CHARACTER_COLORS`. Used to
// NAME the swatches of the editor's palette: without them, all twenty buttons read
// "Change the colour", so to the keyboard and the screen reader the palette was
// twenty homonymous buttons whose only piece of information, the colour, was never
// spoken. The last ten are tab20's light tints, hence the `Light` suffix that
// distinguishes them from their dark counterpart.
//
// Keys and not the words: this module is pure and covered by `node --test`, so it
// does not import `locale.js` (which reads the URL and the navigator as soon as it
// is imported); the characters panel is what translates. The rank-by-rank pairing
// with the hex values, on the other hand, stays checked here, next to them.
export const CHARACTER_COLOR_KEYS = [
  "color.blue",
  "color.orange",
  "color.green",
  "color.red",
  "color.purple",
  "color.brown",
  "color.pink",
  "color.grey",
  "color.olive",
  "color.cyan",
  "color.blueLight",
  "color.orangeLight",
  "color.greenLight",
  "color.redLight",
  "color.purpleLight",
  "color.brownLight",
  "color.pinkLight",
  "color.greyLight",
  "color.oliveLight",
  "color.cyanLight",
];

const PALETTE = new Set(CHARACTER_COLORS);

// A character colour as it may be STORED: the palette, and nothing else. Used to
// decide whether a repair is needed, never to display.
export function isPaletteColor(value) {
  return typeof value === "string" && PALETTE.has(value.toLowerCase());
}

// The first free colour, starting over from the beginning once the palette is
// exhausted. `used` is a Set of colours already taken.
//
// `assignedCount` is the number of characters ALREADY served, and it is necessary:
// once the palette is exhausted, `used` stops growing, so using it to pick the
// fallback gave the same colour to every character past the twentieth (the 21st
// and the 25th both started over on the first blue). With the count, the palette
// really does loop.
export function firstFreeColor(used, assignedCount = used.size) {
  return (
    CHARACTER_COLORS.find((c) => !used.has(c)) ??
    CHARACTER_COLORS[assignedCount % CHARACTER_COLORS.length]
  );
}

// The colour of each character, by id. Deterministic and stateless: a colour that
// is already valid and still free is kept, everything else (absent, foreign,
// duplicated) gets the first free one.
//
// This is the SAME filling in that `sanitizeScript` (src/editor/reducer.js) applies
// when script.json is loaded, and it is what makes Editing and Speaking share show
// exactly the same colours: the published script does not necessarily carry
// colours (the troupe's file had none before this change), and the two pages fill
// them in identically instead of waiting for the coordinator to re-download the
// script from the editor.
export function assignColors(characters) {
  const used = new Set();
  const byId = new Map();
  for (const c of Array.isArray(characters) ? characters : []) {
    if (!c || typeof c !== "object" || typeof c.id !== "string" || !c.id) continue;
    if (byId.has(c.id)) continue;
    const color =
      isPaletteColor(c.color) && !used.has(c.color.toLowerCase())
        ? c.color.toLowerCase()
        : firstFreeColor(used, byId.size);
    used.add(color);
    byId.set(c.id, color);
  }
  return byId;
}

// The STORED colour of a character designated by their id, or `null` when the id
// is unknown (or when the colour is not from the palette). The fallback, a neutral
// token, belongs to the caller: the editor's grey is not the grey of a pie chart
// legend.
//
// A plain lookup, with no filling in: this is the call for consumers whose
// characters ALREADY carry their colour, the editor first among them
// (`sanitizeScript` guarantees it on every character at load time), and it is
// called once per line row. Whoever reads a manifest, where the colour may be
// missing, calls `assignColors` once and keeps the Map.
export function characterColor(characters, id) {
  const character = (Array.isArray(characters) ? characters : []).find((c) => c && c.id === id);
  return character && isPaletteColor(character.color) ? character.color.toLowerCase() : null;
}

// The maximum lightness of a colour that carries TEXT. Measured: at 0.5 all twenty
// colours are above 5:1 on the cream (5.01) as on the white (5.40), hence at the
// level of `--ink-soft`, which the project holds to be the minimum for informative
// text. Going up to 0.52 falls back to 4.63, too close to the 4.5 threshold for a
// palette we may yet retouch.
const INK_MAX_LIGHTNESS = 0.5;

// The same colour, dark enough to carry TEXT or a hairline.
//
// The palette is made of flat fills: the reference only ever uses it for pie
// slices and pixels, and on the site's cream (`--paper` #faf6ef) its olive sits at
// 1.87:1 and its pale yellow at 1.34:1. The editor, however, paints text with it
// (the character select, the name on a search result).
//
// **We CAP the lightness, we do not mix with black.** A `color-mix(… 60%, #000)`
// was tried first: it holds the contrast (4.97 at the minimum) but it multiplies
// the lightness AND the chroma, so it puts the colour out at the same time as it
// darkens it. Blue #1f77b4 fell there to a chroma of 0.074 and the character's
// name read as black in the editor, where the colour is precisely the only cue
// that tells one line from another. The lightness cap keeps the original chroma
// (0.124 for the same blue, i.e. a plain blue) and gives BETTER contrast (5.01 at
// the minimum), because it brings every colour to the same lightness instead of
// darkening the dark ones, already legible, by just as much.
//
// Derived and not a second hand-written list: twenty more hex values to keep in
// sync would be twenty chances to drift.
//
// The relative colour syntax (`oklch(from …)`) has been available everywhere since
// 2024, and its fallback is harmless: an invalid declaration is ignored, so the
// text keeps its inherited colour and stays legible, it only loses its per-character
// coding.
export function characterInk(color) {
  return `oklch(from ${color} min(l, ${INK_MAX_LIGHTNESS}) c h)`;
}
