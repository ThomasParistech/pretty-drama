// Data loading shared by all pages. Paths are RELATIVE: a play's pages live in its
// own folder, so `data/manifest.json` names THAT play's manifest and no page has to
// know which one. Only the two root pages read `data/plays.json`.
// Covered by `node --test`, so it never imports locale.js: `t` arrives as an argument.

// Distinguishes "does not exist" (404, legitimate empty start) from "exists but is
// unreadable" (parse error, must NOT be treated as empty or real data gets overwritten).
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

export function fetchPlaysIndex() {
  return fetchJson("data/plays.json");
}

// The root journal. ABSENT is the NORMAL case (the file is born with the first
// unroutable upload), so a 404 returns an empty log where every other read errors.
export async function fetchUnroutedHistory() {
  try {
    return await fetchJson("data/history.json");
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return { runs: [] };
    throw err;
  }
}

// Map lineId -> n, 1-based; `size` is the total.
export function myLineNumbers(lines, characterId) {
  const numbers = new Map();
  if (characterId === "") return numbers;
  let n = 0;
  for (const line of lines) {
    if (line.characterId === characterId) numbers.set(line.id, ++n);
  }
  return numbers;
}

// Returns "" when the line is not mine, so the caller tests nothing.
export function myLineNumber(t, numbers, lineId) {
  const n = numbers.get(lineId);
  return n == null ? "" : t("common.myLineNumber", { n, total: numbers.size });
}

// Scenes the menu offers, as INDEXES into `scenes`: hiding an option must never
// renumber the ones that stay. Once a character is chosen, only the scenes they speak
// in. Falls back to the WHOLE act when nobody is chosen or when they speak nowhere in
// it, because an empty menu offers no way out of the act it is stuck in.
export function sceneChoices(scenes, characterId) {
  const all = scenes.map((_, i) => i);
  if (characterId === "") return all;
  const mine = all.filter((i) =>
    scenes[i].lines.some((line) => line.characterId === characterId)
  );
  return mine.length > 0 ? mine : all;
}

// Same rule one level up: a character who speaks in one act only must not be offered the
// others, where every scene menu would fall back to the whole act and every line be
// someone else's. Same INDEX and same whole-play fallback as `sceneChoices`.
export function actChoices(acts, characterId) {
  return sceneChoices(
    acts.map((a) => ({ lines: a.scenes.flatMap((s) => s.lines) })),
    characterId
  );
}

export function setBeforeUnloadGuard(enabled) {
  window.onbeforeunload = enabled
    ? (e) => {
        e.preventDefault();
        // `returnValue` is required for the prompt to appear.
        e.returnValue = "";
        return "";
      }
    : null;
}

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

// THIS troupe's repo on github.com, rebuilt from the Pages URL so links point at the
// fork and not the template. Returns null when the repo cannot be known for sure
// (custom domain): the caller hides the link rather than forge a 404.
export function githubRepoUrl() {
  const suffix = ".github.io";
  const { hostname, pathname } = window.location;
  let owner, repo;
  if (hostname.endsWith(suffix)) {
    owner = hostname.slice(0, -suffix.length);
    const first = pathname.split("/").filter(Boolean)[0];
    // Root site (`owner.github.io`): the first segment is NOT a repository, the repo
    // is named after the domain. Three shapes say so: nothing, a file name, and
    // `plays` (a play's page is at `/plays/<id>/…`, whose first segment otherwise
    // looks like a repo name). Accepted limit: a repo literally named `plays`.
    repo = !first || first.endsWith(".html") || first === "plays" ? hostname : first;
  } else if (import.meta.env.DEV) {
    // Local dev is not on github.io: point at the template so the link renders. NOT
    // meant to be committed to during dev.
    owner = "ThomasParistech";
    repo = "pretty-drama";
  }
  if (!owner || !repo) return null;
  return `https://github.com/${owner}/${repo}`;
}

// The branch both GitHub URLs below name, written once. It must REALLY exist:
// `/upload/<branch>` and `/new/<branch>` silently drop the form and land on the repo
// home page otherwise (measured), and `/tree/` resolves names they reject, so a folder
// link keeps working while the upload button goes nowhere. Test the button itself.
const BRANCH = "main";

// GitHub's upload page for a play's zone, or the ROOT of `uploads/` with no id.
// The FOLDER routes the file, never its content: a damaged ZIP still reaches its
// play's journal.
export function githubUploadUrl(playId) {
  const repo = githubRepoUrl();
  if (!repo) return null;
  return `${repo}/upload/${BRANCH}/uploads${playId ? `/${playId}` : ""}`;
}

// Mirror of `NEW_PLAY_DIR` (process_uploads.py), compared by test_contracts.py: the
// FOLDER is the whole instruction, so a drifted name commits into a folder nothing
// scans. `_` is outside SAFE_PLAY_ID, so it can never collide with a play's zone.
const NEW_PLAY_DIR = "_new-play";

// Mirror of `TITLE_SEPARATOR` (process_uploads.py), which READS it; compared by
// test_contracts.py. Diverged, the note is read as part of the title and every
// creation is refused for carrying several lines.
const TITLE_SEPARATOR = "---";

// GitHub's pre-filled "new file" page: the play CREATION gesture in ONE click, nothing
// downloaded. The Action reads neither name nor extension of what lands in
// `_new-play/`, since both are editable fields on that page; the `.txt` is a courtesy.
// Content is the title, the separator, then `note` for the human, which the Action
// never reads. `note` is MANDATORY and has no default: it is interface text, and this
// module cannot reach the catalogues (it is under `node --test`).
// THE SLASHES IN `filename` STAY LITERAL. Percent-encoded, GitHub reads the whole
// value as a file NAME and the play is committed at the repo root, where no workflow
// watches and nothing reports it. Check this URL by CLICKING it on a real fork: a
// malformed `/new/` answers with the repository home page, not an error.
export function githubNewPlayUrl(playId, title, note) {
  const repo = githubRepoUrl();
  if (!repo) return null;
  const filename = `uploads/${NEW_PLAY_DIR}/${encodeURIComponent(playId)}.txt`;
  const content = `${title}\n${TITLE_SEPARATOR}\n${note}\n`;
  return `${repo}/new/${BRANCH}?filename=${filename}&value=${encodeURIComponent(content)}`;
}

// "Éléonore d'Aquitaine" -> "eleonore-d-aquitaine". Downloaded file names only, never
// an identifier (except through `mintPlayId`, which bounds the length).
// `fallback` is MANDATORY: it lands in a file name, so it is interface text. The empty
// test stays HERE though: "???" is a non-empty string that slugs to nothing, so only
// the result knows.
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

// Quoting a line in a confirmation modal: a long speech would fill the screen.
export const EXCERPT_MAX = 140;

export function excerpt(text) {
  const trimmed = (text ?? "").trim();
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX)}…` : trimmed;
}
