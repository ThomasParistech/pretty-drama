import {
  BarsIcon,
  DialogueIcon,
  MasksIcon,
  MicIcon,
  QuillIcon,
} from "./icons.jsx";

// Source de vérité de l'identité des pages : son libellé, son lien, et son
// « sceau » (l'icône reprise dans le bandeau, sur les cartes d'accueil et dans
// le favicon). Les couleurs, elles, vivent en CSS : cf. les classes
// `.page-<clé>` de src/shared/theme.css, qui portent --page-mark.
// `desc` ne sert qu'aux cartes de l'accueil.
export const PAGES = {
  home: {
    href: "./index.html",
    label: "Accueil",
    Icon: MasksIcon,
  },
  rehearsal: {
    href: "./rehearsal.html",
    label: "Répétition",
    Icon: DialogueIcon,
    desc: "Répétez « à l'italienne » : la pièce se joue avec les vraies voix, vous dites vos répliques au bon moment.",
  },
  recorder: {
    href: "./recorder.html",
    label: "Enregistrement",
    Icon: MicIcon,
    desc: "Choisissez votre personnage, enregistrez vos répliques, puis envoyez le fichier à votre responsable.",
  },
  dashboard: {
    href: "./dashboard.html",
    label: "Avancement",
    Icon: BarsIcon,
    desc: "Qui a enregistré quoi ? Quelles répliques restent à faire ou à refaire ?",
  },
  editor: {
    href: "./editor.html",
    label: "Édition",
    Icon: QuillIcon,
    desc: "Saisissez et corrigez le texte de la pièce : personnages, actes, scènes et répliques.",
  },
};

// Deux accueils, même composant, deux listes de cartes. `index.html` est
// l'adresse qu'on donne à la troupe : elle ne propose QUE les deux pages des
// acteurs, pour qu'un acteur ne tombe jamais sur l'éditeur (d'où le script de
// la pièce se télécharge) ni sur l'avancement. `respo.html` est l'accueil
// complet, connu du seul responsable : aucune page n'y renvoie depuis
// `index.html`, il se bookmarke.
export const ACTOR_CARDS = ["rehearsal", "recorder"];

// Carré 2x2 : la troupe en haut (répéter, enregistrer), le responsable en bas
// (écrire, suivre), donc Avancement en bas à droite.
export const RESPO_CARDS = ["rehearsal", "recorder", "editor", "dashboard"];

// Accueil vers lequel renvoie la marque du bandeau : les pages du responsable
// ramènent à SON accueil, sinon un aller-retour Édition → marque → Accueil lui
// ferait perdre le chemin de l'éditeur.
const RESPO_ONLY = new Set(["editor", "dashboard"]);

export function homeHref(page) {
  return RESPO_ONLY.has(page) ? "./respo.html" : "./index.html";
}
