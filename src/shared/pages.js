import {
  BarsIcon,
  DialogueIcon,
  MasksIcon,
  MicIcon,
  PieIcon,
  QuillIcon,
} from "./icons.jsx";

// The identity of each page: its link and its "seal" (the icon reused in the
// header, on the home cards and in the favicon). Colours live in CSS, in the
// `.page-<key>` classes of src/shared/theme.css, which carry --page-mark.
//
// STRUCTURE ONLY: the words have moved out. A page label is `page.<key>.label`
// and its compact doc sentence is `page.<key>.desc`, both in
// src/shared/locales/. The writing doctrine for those two now lives there, next
// to the text it governs, and a guard in scripts/tests/test_contracts.py checks
// that every key here has both.
//
// The one-sentence-two-places rule still holds and now costs nothing: the home
// card and the first line of the page header (which PlayHeader renders itself)
// read the SAME `desc` key, so a card cannot promise one thing while the header
// says another.
export const PAGES = {
  home: {
    href: "./index.html",
    Icon: MasksIcon,
  },
  rehearsal: {
    href: "./rehearsal.html",
    Icon: DialogueIcon,
  },
  recorder: {
    href: "./recorder.html",
    Icon: MicIcon,
  },
  stats: {
    href: "./stats.html",
    Icon: PieIcon,
  },
  dashboard: {
    href: "./dashboard.html",
    Icon: BarsIcon,
  },
  editor: {
    href: "./editor.html",
    Icon: QuillIcon,
  },
};

// The catalogue keys of a page, so no caller builds them by hand and the CI guard
// has a single shape to look for.
export function pageLabelKey(page) {
  return `page.${page}.label`;
}

export function pageDescKey(page) {
  return `page.${page}.desc`;
}

// Deux accueils, même composant, deux listes de cartes. `index.html` est
// l'adresse qu'on donne à la troupe : elle ne propose QUE les deux pages des
// acteurs, pour qu'un acteur ne tombe jamais sur l'éditeur (d'où le script de
// la pièce se télécharge) ni sur l'avancement. `respo.html` est l'accueil
// complet, connu du seul responsable : aucune page n'y renvoie depuis
// `index.html`, il se bookmarke.
export const ACTOR_CARDS = ["rehearsal", "recorder", "stats"];

// Trois colonnes : la troupe en haut (répéter, enregistrer, comparer), le
// responsable en bas (écrire, suivre), centré sous elle. La rangée dit donc à
// qui la page s'adresse, ce que le carré 2x2 disait avant que la Répartition
// s'ajoute aux pages ouvertes à tout le monde.
export const RESPO_CARDS = ["rehearsal", "recorder", "stats", "editor", "dashboard"];

// Accueil vers lequel renvoie la marque du bandeau : les pages du responsable
// ramènent à SON accueil, sinon un aller-retour Édition → marque → Accueil lui
// ferait perdre le chemin de l'éditeur.
const RESPO_ONLY = new Set(["editor", "dashboard"]);

export function homeHref(page) {
  return RESPO_ONLY.has(page) ? "./respo.html" : "./index.html";
}
