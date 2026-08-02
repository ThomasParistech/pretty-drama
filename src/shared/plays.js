// A play's id names its folder (`plays/<id>/`) and its URL segment, so it is minted
// ONCE and NEVER re-minted: renaming would break links already handed to the cast and
// orphan a folder of clips. `mint_play_id` (scripts/common.py) DECIDES it on arrival;
// `mintPlayId` here only ANNOUNCES it so the management page can refuse a bad title on
// the spot. Held together by scripts/tests/play-id-cases.json, read by both suites.
// PURE module: no DOM, no storage, covered by `node --test`.

import { slugify } from "./data.js";

// Mirror of PLAY_ID_PATTERN (scripts/common.py), compared character for character by
// scripts/tests/test_contracts.py. No leading hyphen: a folder so named reads as a
// command-line option. 64 characters because it names a path.
export const SAFE_PLAY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isPlayId(value) {
  return typeof value === "string" && SAFE_PLAY_ID.test(value);
}

// The site's test bench, a real play absent from data/plays.json. Needed HERE because
// the creation box reads taken addresses from plays.json, where this one is missing.
// Mirror of `DEV_PLAY_ID` (scripts/common.py), guarded by test_contracts.py.
export const DEV_PLAY_ID = "dev";

// Bound of the pattern above: `mintPlayId` truncates to the same length, or it would
// announce an id the Action refuses.
export const MAX_PLAY_ID_LENGTH = 64;

// Returns "" when the title leaves nothing: the caller asks for another title rather
// than announce a folder named "piece-1".
export function mintPlayId(title) {
  const base = slugify(typeof title === "string" ? title : "", "");
  return base.slice(0, MAX_PLAY_ID_LENGTH).replace(/-+$/g, "");
}
