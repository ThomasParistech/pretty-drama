// A character's colour. PURE module, replayed by `node --test`.
// Tableau 10 then tab20's ten light tints: LIGHTNESS is what separates colours, not
// hue (a fixed-lightness palette measured ΔE 15.9 minimum and neighbours blended on
// the Speaking share pixel block). Up to ten characters nobody sees a pale tint;
// beyond twenty it loops, bounded degradation.
// The colour is STORED as hex, never a hue: `#ff7f0e` and `#8c564b` share an angle
// and `#7f7f7f` has none.
import type { Character } from "./types.ts";

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

// Catalogue KEY of each colour, paired by RANK with `CHARACTER_COLORS`, naming the
// editor's swatches. Keys and not words: this module is pure and never imports
// locale.ts; the characters panel translates.
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

export function isPaletteColor(value: unknown): value is string {
  return typeof value === "string" && PALETTE.has(value.toLowerCase());
}

// The first free colour, wrapping once the palette is exhausted. `assignedCount` is
// separate because `used` STOPS GROWING at that point: deriving the fallback from it
// gave the same blue to the 21st and the 25th character.
export function firstFreeColor(used: Set<string>, assignedCount: number = used.size): string {
  return (
    CHARACTER_COLORS.find((c) => !used.has(c)) ??
    CHARACTER_COLORS[assignedCount % CHARACTER_COLORS.length]
  );
}

// Colour per character id. Deterministic and stateless: a valid free colour is kept,
// anything else takes the first free one. The ONE implementation of filling in, also
// used by `sanitizeScript` (editor/reducer.ts), so Editing and Speaking share agree on
// a script that carries no colours.
export function assignColors(characters: unknown): Map<string, string> {
  const used = new Set<string>();
  const byId = new Map<string, string>();
  for (const c of (Array.isArray(characters) ? characters : []) as Character[]) {
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

// Plain lookup, NO filling in, for consumers whose characters already carry a colour
// (the editor, once per line row). Returns null and lets the caller pick its own
// neutral token. Reading a manifest instead? Call `assignColors` once and keep the Map.
export function characterColor(characters: unknown, id: unknown): string | null {
  const character = ((Array.isArray(characters) ? characters : []) as Character[]).find(
    (c) => c && c.id === id
  );
  return character && isPaletteColor(character.color) ? character.color.toLowerCase() : null;
}

// Measured: at 0.5 all twenty colours clear 5:1 on cream and white. 0.52 drops to
// 4.63, too close to the 4.5 threshold.
const INK_MAX_LIGHTNESS = 0.5;

// The same colour, dark enough to carry TEXT (the palette is made for flat fills: its
// olive is 1.87:1 on the cream).
// CAP the lightness, do NOT mix with black: `color-mix(… 60%, #000)` also crushes the
// chroma (blue fell to 0.074 and read as black), and the cap measures better anyway.
export function characterInk(color: string): string {
  return `oklch(from ${color} min(l, ${INK_MAX_LIGHTNESS}) c h)`;
}
