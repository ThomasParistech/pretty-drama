// The identity of a play: the identifier that names its folder.
//
// A play lives in `plays/<id>/` (its pages, its data, its clips) and its upload
// area is `uploads/<id>/`, so this identifier is at once a folder name and a URL
// segment, which the troupe reads in its address bar: hence a slug derived from
// the title rather than a UUID as for the lines, which only ever name mp3 files.
//
// It is minted ONCE, when the play is created, and NEVER changes afterwards, for
// the reason that forbids recycling a line id: renaming the play changes its
// title, not its folder. Making it follow along would break the links already
// handed to the cast, and would leave behind a folder of clips nothing claims any
// more.
//
// What MINTS it for real is the Action (`mint_play_id`, scripts/common.py): the site
// creates a play by handing over its title, nothing else, and the identifier is derived
// from that title on arrival. What this module does with `mintPlayId` is ANNOUNCE that
// same address beforehand, so the management page can refuse an unusable title or a
// duplicate on the spot instead of letting the coordinator discover it in the journal
// minutes later. The two are held together by scripts/tests/play-id-cases.json, read by
// both test suites.
//
// A PURE module (no DOM, no storage, no `window`): it is covered by `node --test`
// and imported both by the Editing reducer and by the play management page.

import { slugify } from "./data.js";

// Mirror of PLAY_ID_PATTERN in scripts/common.py, to be kept in sync: a guard in
// scripts/tests/test_contracts.py compares the two expressions character for
// character, as it does for line ids.
//
// Lowercase, digits and hyphens, never a leading hyphen: that is exactly what
// `slugify` (src/shared/data.js) produces, and a folder name starting with a
// hyphen reads like a command-line option. Bounded to 64 characters like a line
// id, for the same reason: it names a path.
export const SAFE_PLAY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isPlayId(value) {
  return typeof value === "string" && SAFE_PLAY_ID.test(value);
}

// The play that belongs to no troupe: the site's own test bench, the one a developer
// opens to see a page on real data without touching the troupe's play.
//
// It lives in the repository like any other (`plays/dev/`), but `build_plays_index.py`
// leaves it out of data/plays.json, so it appears in neither root page and only a
// hand-written URL reaches it. Which is exactly why this constant has to exist HERE too:
// the creation box refuses a title whose address is already taken, and it reads that
// list from plays.json, where this one is missing. Without it the coordinator would be
// told the address is free, would commit their title, and would only learn minutes later
// from the journal that the Action refused it.
//
// Mirror of `DEV_PLAY_ID` (scripts/common.py), held by a guard in
// scripts/tests/test_contracts.py.
export const DEV_PLAY_ID = "dev";

// The bound of the pattern above, written once: `mintPlayId` must truncate to the
// same length, otherwise an overlong title would produce an identifier the site
// has just minted and the Action would refuse.
export const MAX_PLAY_ID_LENGTH = 64;

// The identifier a play about to be created will receive, derived from its title.
//
// `slugify` is the project's only slug maker (src/shared/data.js): it is already
// what names the ZIP of the takes and the play's PDF, and its output (lowercase,
// digits, hyphens, no hyphen at either end) is exactly what SAFE_PLAY_ID accepts.
// All that is left is bounding the length, truncation being able to leave a
// trailing hyphen.
//
// Returns the empty string when the title leaves nothing (empty, or all
// punctuation): the caller then asks for another title rather than announce a folder
// named "piece-1" that would mean nothing to anyone.
export function mintPlayId(title) {
  const base = slugify(typeof title === "string" ? title : "", "");
  return base.slice(0, MAX_PLAY_ID_LENGTH).replace(/-+$/g, "");
}
