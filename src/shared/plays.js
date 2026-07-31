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

// The bound of the pattern above, written once: `mintPlayId` must truncate to the
// same length, otherwise an overlong title would produce an identifier the site
// has just minted and the Action would refuse.
export const MAX_PLAY_ID_LENGTH = 64;

// The identifier of a play about to be created, derived from its title.
//
// `slugify` is the project's only slug maker (src/shared/data.js): it is already
// what names the ZIP of the takes and the play's PDF, and its output (lowercase,
// digits, hyphens, no hyphen at either end) is exactly what SAFE_PLAY_ID accepts.
// All that is left is bounding the length, truncation being able to leave a
// trailing hyphen.
//
// Returns the empty string when the title leaves nothing (empty, or all
// punctuation): the caller then asks for another title rather than build a folder
// named "piece-1" that would mean nothing to anyone.
export function mintPlayId(title) {
  const base = slugify(typeof title === "string" ? title : "", "");
  return base.slice(0, MAX_PLAY_ID_LENGTH).replace(/-+$/g, "");
}

// The empty play the management page makes you download in order to create one.
//
// Mirror of `EMPTY_SCRIPT` (src/editor/reducer.js), and a test holds the two in
// agreement: it is the same document, one serving as the editor's fallback and the
// other as the seed of a brand new play. The empty act and scene are not
// decorative, they are the structural floor the editor lays down too, because
// there has to be a scene to write the first line in.
export function newPlayScript(id, title, language) {
  return { id, title, language, characters: [], acts: [{ scenes: [{ lines: [] }] }] };
}
