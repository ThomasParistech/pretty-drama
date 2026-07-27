// Data loading shared by all pages.
//
// Pages read ONLY data/manifest.json (+ mp3 clips) — except the editor, which
// also reads data/script.json (the source of truth it produces).

// Distinguishes "file does not exist" (404 → legitimate empty start) from
// "file exists but is unreadable" (parse error → must NOT be treated as
// empty, or the user could overwrite real data).
export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} sur ${url}`);
    this.status = status;
  }
}

export async function fetchJson(relativeUrl) {
  const res = await fetch(`${relativeUrl}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new HttpError(res.status, relativeUrl);
  try {
    return await res.json();
  } catch {
    throw new Error(`Fichier illisible (JSON invalide) : ${relativeUrl}`);
  }
}

export function fetchManifest() {
  return fetchJson("data/manifest.json");
}

export function fetchScript() {
  return fetchJson("data/script.json");
}

export const MANIFEST_ERROR_MESSAGE =
  "Impossible de charger la pièce. Le site n'est peut-être pas encore publié : " +
  "réessayez dans quelques minutes ou contactez votre responsable.";

// Numérotation « (n/total) » de mes répliques dans la scène courante,
// partagée par les pages Répétition et Enregistrement : Map lineId -> n
// (1-based) ; `size` donne le total.
export function myLineNumbers(lines, characterId) {
  const numbers = new Map();
  if (characterId === "") return numbers;
  let n = 0;
  for (const line of lines) {
    if (line.characterId === characterId) numbers.set(line.id, ++n);
  }
  return numbers;
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

// The respo's own GitHub upload page, derived from the Pages URL.
// Project sites live at https://<owner>.github.io/<repo>/…, so we can rebuild
// https://github.com/<owner>/<repo>/upload/<branch>/uploads, pointing at THIS
// troupe's repo, not the template's. Branch is `master` to match the workflows.
// UN seul dossier de dépôt, `uploads/`, pour les deux sortes de fichiers (ZIP de
// voix et script.json) : l'Action déduit le type de l'extension, donc il n'y a
// qu'une adresse à connaître et un seul bouton à montrer.
// Returns null anywhere we can't know the repo for sure (local dev, custom
// domain): the caller hides the link rather than forge a 404.
export function githubUploadUrl() {
  const suffix = ".github.io";
  const { hostname, pathname } = window.location;
  let owner, repo;
  if (hostname.endsWith(suffix)) {
    owner = hostname.slice(0, -suffix.length);
    const first = pathname.split("/").filter(Boolean)[0];
    // Site racine (`owner.github.io`) : les pages vivent à la racine, donc le
    // premier segment est un nom de fichier (« dashboard.html ») et pas un
    // dépôt ; ce dépôt-là porte le nom du domaine. Sans ce cas, le bouton de
    // dépôt pointait vers github.com/<owner>/dashboard.html, soit un 404 sur le
    // geste quotidien du respo.
    repo = !first || first.endsWith(".html") ? hostname : first;
  } else if (import.meta.env.DEV) {
    // Local dev is not on github.io, so we can't know the real repo. Point at
    // the template so the link renders and can be styled/tested; it is NOT
    // meant to be committed to during dev.
    owner = "ThomasParistech";
    repo = "prettydrama-voices";
  }
  if (!owner || !repo) return null;
  return `https://github.com/${owner}/${repo}/upload/master/uploads`;
}

// "Serge" -> "serge", "Éléonore d'Aquitaine" -> "eleonore-d-aquitaine"
// (used only for the ZIP filename — readability, not identity)
export function slugify(name) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "personnage"
  );
}
