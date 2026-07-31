// Data loading shared by all pages.
//
// Les pages d'une pièce lisent UNIQUEMENT `data/manifest.json` (+ les mp3 de
// `clips/`), sauf l'Édition, qui lit aussi `data/script.json` (la source de vérité
// qu'elle produit). Ces chemins sont RELATIFS, et ils le restent depuis que le dépôt
// héberge plusieurs pièces : les pages d'une pièce vivent dans le dossier de la
// pièce (`plays/<id>/rehearsal.html`), donc `data/manifest.json` y désigne le
// manifest de CETTE pièce, sans qu'aucune page ait à savoir laquelle.
//
// Les deux pages RACINE (sélecteur de pièce et gestion des pièces) lisent
// `data/plays.json`, le seul fichier au-dessus des pièces.

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

// L'index des pièces, lu par les deux pages racine (et par elles seules : une pièce
// ignore les autres). Le fichier est dérivé, écrit par scripts/build_plays_index.py.
export function fetchPlaysIndex() {
  return fetchJson("data/plays.json");
}

// Le journal des dépôts qu'aucune pièce n'a réclamés, affiché par la page de gestion.
// ABSENT est le cas NORMAL, et c'est même le cas heureux : ce fichier ne naît qu'au
// premier dépôt non routable. Un 404 rend donc un journal vide plutôt qu'une erreur,
// là où les autres lectures du site traitent un 404 comme un vrai problème.
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

// Le suffixe « (3/12) » collé au nom du personnage sur MES cartes, rendu par les
// deux mêmes pages. Il vit ici, à côté de la Map qui le calcule, parce que le
// gabarit était écrit deux fois dans deux JSX (parenthèses et barre comprises),
// donc à deux mots d'une divergence silencieuse côté français.
// `t` arrive en ARGUMENT et n'est pas importé : ce module est couvert par
// `node --test`, et `locale.js` lit l'URL, le stockage et le navigateur dès son
// import (même règle que `stats.js`).
// Rend la chaîne vide quand la réplique n'est pas de moi, donc l'appelant n'a
// aucun test à faire de son côté.
export function myLineNumber(t, numbers, lineId) {
  const n = numbers.get(lineId);
  return n == null ? "" : t("common.myLineNumber", { n, total: numbers.size });
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
    // Site racine (`owner.github.io`) : les pages vivent à la racine, donc le
    // premier segment n'est pas un dépôt ; ce dépôt-là porte le nom du domaine.
    // Sans ce cas, le bouton de dépôt pointait vers
    // github.com/<owner>/dashboard.html, soit un 404 sur le geste quotidien du respo.
    //
    // Trois formes de premier segment disent « site racine » : rien du tout
    // (l'adresse nue), un nom de fichier (« dashboard.html »), et `plays` depuis que
    // les pages d'une pièce vivent deux niveaux plus bas. Ce dernier cas est le
    // seul qui ne se voie pas à l'œil : sur un site racine, l'Avancement d'une
    // pièce est à `/plays/<id>/dashboard.html`, donc son premier segment ressemble
    // à un nom de dépôt et le bouton visait `github.com/<owner>/plays`.
    //
    // Limite connue et acceptée : une troupe dont le DÉPÔT s'appelle littéralement
    // `plays` verrait ses liens GitHub pointer à côté. La lever demanderait de
    // connaître la profondeur de la page courante, donc de la faire descendre en
    // argument depuis chacun de ses appelants, alors que le seul dégât est un lien
    // qui rend un 404 sur un dépôt qu'aucune troupe n'a de raison de nommer ainsi.
    repo = !first || first.endsWith(".html") || first === "plays" ? hostname : first;
  } else if (import.meta.env.DEV) {
    // Local dev is not on github.io, so we can't know the real repo. Point at
    // the template so the link renders and can be styled/tested; it is NOT
    // meant to be committed to during dev.
    owner = "ThomasParistech";
    repo = "prettydrama-voices";
  }
  if (!owner || !repo) return null;
  return `https://github.com/${owner}/${repo}`;
}

// La page d'envoi de GitHub sur la zone de dépôt d'une pièce, `uploads/<id>/`, ou
// sur la RACINE d'`uploads/` quand aucune pièce n'est nommée.
//
// **Une zone de dépôt par pièce**, et c'est le dossier qui route le fichier vers sa
// pièce, jamais son contenu : un ZIP abîmé, donc illisible, atterrit quand même dans
// le journal de sa pièce. Le respo ne tape jamais ce chemin, il clique le bouton de
// la pièce où il travaille. La branche est `master`, comme dans les workflows.
//
// Sans identifiant, l'URL vise la racine, qui est le canal de CRÉATION : un script
// qui nomme une pièce encore inexistante. C'est ce que propose la page de gestion.
export function githubUploadUrl(playId) {
  const repo = githubRepoUrl();
  if (!repo) return null;
  return `${repo}/upload/master/uploads${playId ? `/${playId}` : ""}`;
}

// Le dossier d'une pièce sur github.com, pour le seul geste que le site ne peut pas
// porter : supprimer une pièce, qui demande un commit. La page de gestion y renvoie
// plutôt que de faire semblant.
export function githubPlayFolderUrl(playId) {
  const repo = githubRepoUrl();
  if (!repo) return null;
  return `${repo}/tree/master/plays/${playId}`;
}

// "Serge" -> "serge", "Éléonore d'Aquitaine" -> "eleonore-d-aquitaine"
// Ne nomme jamais rien d'identifiant : uniquement des fichiers téléchargés, pour
// qu'ils se relisent dans un dossier de téléchargements. Deux appelants, le ZIP
// des prises (noms de personnages) et le PDF de la pièce (son titre).
//
// `fallback` est un paramètre OBLIGATOIRE, et il n'a plus de valeur par défaut :
// le repli finit dans le nom du fichier obtenu, donc c'est un texte d'interface
// (un acteur anglophone ne reçoit pas « personnage.zip »), et le défaut français
// qui vivait ici était le dernier mot du site que sa locale ne pouvait pas
// atteindre. Il est de surcroît propre à l'appelant : « personnage.pdf » pour la
// pièce serait un mot de travers. Le TEST, lui, reste ici et pas chez
// l'appelant : une chaîne peut être non vide et ne rien laisser au slug (un
// titre tout en ponctuation, « ??? »), donc vérifier l'entrée avant d'appeler ne
// suffit pas. Seul le résultat sait s'il est vide.
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

// Citation d'une réplique dans une modale de confirmation (`.confirm-quote`) :
// une tirade y tiendrait toute la hauteur de l'écran. Partagé par l'éditeur
// (supprimer la réplique) et l'enregistrement (supprimer la prise), qui
// citent la même chose au même endroit.
export const EXCERPT_MAX = 140;

export function excerpt(text) {
  const trimmed = (text ?? "").trim();
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX)}…` : trimmed;
}
