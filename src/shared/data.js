// Data loading shared by all pages.
//
// The pages of a play read ONLY `data/manifest.json` (plus the mp3s in `clips/`),
// except Editing, which also reads `data/script.json` (the source of truth it
// produces). These paths are RELATIVE, and they have stayed that way since the
// repository started hosting several plays: the pages of a play live in the play's
// own folder (`plays/<id>/rehearsal.html`), so `data/manifest.json` there names
// THAT play's manifest, without any page having to know which one.
//
// The two ROOT pages (the play chooser and the play management page) read
// `data/plays.json`, the only file living above the plays.

// Distinguishes "file does not exist" (404 → legitimate empty start) from
// "file exists but is unreadable" (parse error → must NOT be treated as
// empty, or the user could overwrite real data).
export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} on ${url}`);
    this.status = status;
  }
}

export async function fetchJson(relativeUrl) {
  const res = await fetch(`${relativeUrl}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new HttpError(res.status, relativeUrl);
  try {
    return await res.json();
  } catch {
    throw new Error(`Unreadable file (invalid JSON): ${relativeUrl}`);
  }
}

export function fetchManifest() {
  return fetchJson("data/manifest.json");
}

export function fetchScript() {
  return fetchJson("data/script.json");
}

// The index of plays, read by the two root pages (and by them alone: a play knows
// nothing of the others). The file is derived, written by
// scripts/build_plays_index.py.
export function fetchPlaysIndex() {
  return fetchJson("data/plays.json");
}

// The log of the uploads no play has claimed, shown by the management page.
// ABSENT is the NORMAL case, and it is even the happy one: this file is only born
// with the first unroutable upload. A 404 therefore returns an empty log rather
// than an error, where every other read on the site treats a 404 as a real
// problem.
export async function fetchUnroutedHistory() {
  try {
    return await fetchJson("data/history.json");
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return { runs: [] };
    throw err;
  }
}

// The manifest error message used to live here as a constant. It is now the
// `common.manifestError` catalogue key, read by useManifest.js, and it had to
// move: this module is imported by data.test.js under `node --test`, whereas
// locale.js reads `window` and `navigator` at module load. Keeping the split
// keeps the pure modules testable without a DOM, which is the whole test
// strategy of this project.

// The "(n/total)" numbering of my lines in the current scene, shared by the
// Rehearsal and Recording pages: Map lineId -> n (1-based); `size` gives the
// total.
export function myLineNumbers(lines, characterId) {
  const numbers = new Map();
  if (characterId === "") return numbers;
  let n = 0;
  for (const line of lines) {
    if (line.characterId === characterId) numbers.set(line.id, ++n);
  }
  return numbers;
}

// The " (3/12)" suffix stuck to the character's name on MY cards, rendered by
// those same two pages. It lives here, next to the Map that computes it, because
// the template was written twice in two JSX files (brackets and slash included),
// so it was two words away from drifting silently on the French side.
// `t` arrives as an ARGUMENT and is not imported: this module is covered by
// `node --test`, and `locale.js` reads the URL, the storage and the navigator as
// soon as it is imported (same rule as `stats.js`).
// Returns the empty string when the line is not mine, so the caller has no test
// to make on its own side.
export function myLineNumber(t, numbers, lineId) {
  const n = numbers.get(lineId);
  return n == null ? "" : t("common.myLineNumber", { n, total: numbers.size });
}

// Which scenes of an act the scene menu offers, as INDEXES into `scenes` (the
// menu's `<option value>` is that index, and nothing downstream is renumbered:
// hiding an option must never move the ones that stay). Shared by the Rehearsal
// and Recording headers.
//
// Once a character is chosen, only the scenes where they actually speak: an actor
// walking their own part has no use for the twelve scenes they are absent from,
// and on a long play that is most of the menu.
//
// **Two deliberate falls back to the whole act.** With no character chosen, there
// is nobody to filter for. And when the chosen character speaks nowhere in the act,
// filtering would leave an EMPTY menu, a field that opens onto nothing and offers
// no way out of the act it is stuck in; the full list, plus the "no lines in this
// scene" note the two pages already show, says the same thing and leaves the reader
// able to move.
export function sceneChoices(scenes, characterId) {
  const all = scenes.map((_, i) => i);
  if (characterId === "") return all;
  const mine = all.filter((i) =>
    scenes[i].lines.some((line) => line.characterId === characterId)
  );
  return mine.length > 0 ? mine : all;
}

// Warn before closing the tab when there is unsaved in-memory work.
export function setBeforeUnloadGuard(enabled) {
  window.onbeforeunload = enabled
    ? (e) => {
        e.preventDefault();
        // Modern browsers show their own generic message; returnValue is
        // required for the prompt to appear.
        e.returnValue = "";
        return "";
      }
    : null;
}

// Trigger a browser download of a Blob.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// THIS troupe's repo on github.com, derived from the Pages URL.
// Project sites live at https://<owner>.github.io/<repo>/…, so we can rebuild
// https://github.com/<owner>/<repo>, pointing at the troupe's fork and not at the
// template.
// Returns null anywhere we can't know the repo for sure (local dev, custom
// domain): the caller hides the link rather than forge a 404.
export function githubRepoUrl() {
  const suffix = ".github.io";
  const { hostname, pathname } = window.location;
  let owner, repo;
  if (hostname.endsWith(suffix)) {
    owner = hostname.slice(0, -suffix.length);
    const first = pathname.split("/").filter(Boolean)[0];
    // Root site (`owner.github.io`): the pages live at the root, so the first
    // segment is not a repository; that repository is named after the domain.
    // Without this case, the upload button pointed at
    // github.com/<owner>/dashboard.html, i.e. a 404 on the coordinator's daily
    // gesture.
    //
    // Three shapes of first segment say "root site": nothing at all (the bare
    // address), a file name ("dashboard.html"), and `plays` since the pages of a
    // play live two levels further down. That last case is the only one that is
    // not visible to the eye: on a root site, a play's Progress page is at
    // `/plays/<id>/dashboard.html`, so its first segment looks like a repository
    // name and the button aimed at `github.com/<owner>/plays`.
    //
    // Known and accepted limit: a troupe whose REPOSITORY is literally called
    // `plays` would see its GitHub links point somewhere else. Lifting it would
    // mean knowing the depth of the current page, hence passing it down as an
    // argument from every one of its callers, when the only damage is a link that
    // 404s on a repository no troupe has any reason to name that way.
    repo = !first || first.endsWith(".html") || first === "plays" ? hostname : first;
  } else if (import.meta.env.DEV) {
    // Local dev is not on github.io, so we can't know the real repo. Point at
    // the template so the link renders and can be styled/tested; it is NOT
    // meant to be committed to during dev.
    owner = "ThomasParistech";
    repo = "pretty-drama";
  }
  if (!owner || !repo) return null;
  return `https://github.com/${owner}/${repo}`;
}

// The branch the two GitHub URLs of this module name, written once. `main`, which is
// the default branch of the repository the README has troupes fork, hence of their fork.
//
// It has to be a branch that REALLY exists: GitHub only serves
// `/upload/<branch>/<path>` (and `/new/<branch>`) for a real branch, and otherwise
// fails by silently dropping both the form and the path, landing on the repository's
// home page (measured on this repository and on two unrelated ones). `HEAD` fails the
// same way. Worse, the `/tree/` view is more forgiving and resolves names this one
// rejects, so a folder link can keep working while the upload button, the
// coordinator's daily gesture and the sole channel by which anything enters this
// repository, goes nowhere. That is how a wrong value here stays unnoticed: test
// the upload button itself, never a folder link.
//
// The workflows name no branch of their own beyond their `push` filter: they read
// the one they were pushed on. A fork that renames its default branch is the one
// case this constant gets wrong, and the fix is one word here.
const BRANCH = "main";

// GitHub's upload page on a play's upload area, `uploads/<id>/`, or on the ROOT of
// `uploads/` when no play is named.
//
// **One upload area per play**, and it is the FOLDER that routes the file to its
// play, never its content: a damaged ZIP, hence an unreadable one, still lands in
// its play's log. The coordinator never types this path, they click the button of
// the play they are working on.
//
// With no identifier, the URL aims at the root, which is the CREATION channel: a
// script naming a play that does not exist yet. That is what the management page
// offers.
export function githubUploadUrl(playId) {
  const repo = githubRepoUrl();
  if (!repo) return null;
  return `${repo}/upload/${BRANCH}/uploads${playId ? `/${playId}` : ""}`;
}

// The zone where a play is created, written once on this side. Mirror of `NEW_PLAY_DIR`
// (scripts/process_uploads.py), and a guard in scripts/tests/test_contracts.py compares
// the two: the FOLDER is what tells the Action this file is a play to create, so a name
// that drifted here would commit the file into a folder nothing scans, where it would sit
// for good with no play, no journal line and nothing to say so.
//
// It cannot be the name of a play (`_` is outside SAFE_PLAY_ID), which is what keeps the
// creation zone and a play's own upload zone from ever being taken for one another.
const NEW_PLAY_DIR = "_new-play";

// The line that closes the datum and opens the note. Mirror of `TITLE_SEPARATOR`
// (scripts/process_uploads.py), which is the side that READS it, and a guard in
// scripts/tests/test_contracts.py compares the two: diverged, the note would be read as
// part of the title and every creation would be refused for carrying several lines.
const TITLE_SEPARATOR = "---";

// GitHub's "new file" page, pre-filled: the play CREATION gesture, in ONE click.
//
// The site can commit nothing, so a play is still born from a file arriving in
// `uploads/`. What changed is who writes that file: nothing is downloaded any more, this
// URL opens GitHub's own editor with the name and the content already in place, and all
// that is left for the coordinator to do is confirm the commit. One gesture instead of
// three, and no file wandering through a downloads folder.
//
// The FOLDER carries the whole instruction, and that is deliberate: on the page this URL
// opens, the file name is a field and the content is a text box, both of which the
// coordinator can edit before committing. So the Action reads neither the name nor the
// extension of what lands in `_new-play/` (it reads it as one play title, whatever it is
// called), and the `.txt` below is only there so that GitHub opens it as text and so that
// the file reads back in the repository. Only the folder cannot be fumbled.
//
// The content is the title, then the separator, then `note`, which is what the
// coordinator actually READS in that box: a box holding one bare word explains nothing,
// where a sentence says the title is the line above and that committing as-is is all
// there is to do. Everything past the separator is ignored by the Action, so typing into
// the note breaks nothing.
//
// `note` is a MANDATORY parameter with no default, exactly as `slugify`'s fallback is: it
// is interface text, so it belongs in the catalogues and follows the reader's locale,
// and this module cannot reach them (it is covered by `node --test`, where importing
// locale.js would read `window` and `navigator` on load).
//
// `filename` and `value` are GitHub's own parameters on `/new/<branch>`, and the whole
// path goes in `filename`, which is why this one does not carry the folder in the URL
// path the way the upload button does. The slash stays literal (it is legal in a query
// string): percent-encoded, it is the one thing that could have GitHub read the whole
// value as a file NAME, and the play would then be committed at the root of the repo,
// where no workflow watches and nothing reports it.
//
// Like the upload URL, this one has to be checked by CLICKING it on a real fork, never
// by reading it: GitHub answers a malformed `/new/` with its repository home page, so a
// wrong shape here shows the coordinator a plausible GitHub page and no error at all.
//
// Returns null wherever the repository cannot be known (custom domain), like
// `githubUploadUrl`: the caller then hides the gesture rather than forge an address that
// leads nowhere.
export function githubNewPlayUrl(playId, title, note) {
  const repo = githubRepoUrl();
  if (!repo) return null;
  const filename = `uploads/${NEW_PLAY_DIR}/${encodeURIComponent(playId)}.txt`;
  const content = `${title}\n${TITLE_SEPARATOR}\n${note}\n`;
  return `${repo}/new/${BRANCH}?filename=${filename}&value=${encodeURIComponent(content)}`;
}

// "Serge" -> "serge", "Éléonore d'Aquitaine" -> "eleonore-d-aquitaine"
// Never names anything that serves as an identifier: downloaded files only, so
// that they read back in a downloads folder. Two callers, the ZIP of the takes
// (character names) and the play's PDF (its title).
//
// `fallback` is a MANDATORY parameter, and it no longer has a default value: the
// fallback ends up in the name of the file you get, so it is interface text (an
// English-speaking actor does not receive "personnage.zip"), and the French
// default that used to live here was the last word of the site its locale could
// not reach. It is besides specific to the caller: "personnage.pdf" for the play
// would be the wrong word. The TEST, on the other hand, stays here and not at the
// caller: a string can be non-empty and still leave nothing to the slug (a title
// made entirely of punctuation, "???"), so checking the input before calling is
// not enough. Only the result knows whether it is empty.
export function slugify(name, fallback) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

// Quoting a line inside a confirmation modal (`.confirm-quote`): a long speech
// would fill the whole height of the screen there. Shared by the editor (deleting
// the line) and the recorder (deleting the take), which quote the same thing in
// the same place.
export const EXCERPT_MAX = 140;

export function excerpt(text) {
  const trimmed = (text ?? "").trim();
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX)}…` : trimmed;
}
