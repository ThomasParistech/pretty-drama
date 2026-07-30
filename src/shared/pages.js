import {
  BarsIcon,
  DialogueIcon,
  MasksIcon,
  MicIcon,
  PieIcon,
  QuillIcon,
} from "./icons.jsx";

// Source de vérité de l'identité des pages : son libellé, son lien, et son
// « sceau » (l'icône reprise dans le bandeau, sur les cartes d'accueil et dans
// le favicon). Les couleurs, elles, vivent en CSS : cf. les classes
// `.page-<clé>` de src/shared/theme.css, qui portent --page-mark.
// `desc` est la phrase de doc COMPACTE de la page, à un seul endroit pour ses
// deux emplois : la carte de l'accueil, et la première ligne de son bandeau
// (`PlayHeader` la rend lui-même, cf. PlayHeader.jsx). Une carte qui promet une
// chose et un bandeau qui en dit une autre décrivaient deux pages différentes.
// Chaque mode a donc DEUX éléments de doc et pas plus : ce `desc` partout, plus
// le `hint` que son bandeau ajoute en dessous (les précisions qui n'ont pas de
// sens quand on choisit encore sa page).
// Une seule forme pour les cinq, et la même pour les `hint` : un verbe
// d'action à l'impératif en tête, une dizaine de mots, deux phrases au grand
// maximum pour un `hint`. Pas de question posée au lecteur, pas de « Pour les
// acteurs » (l'URL le dit), et les deux-points seulement pour énumérer.
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
    desc: "Répétez à l'italienne, avec les vraies voix de la troupe.",
  },
  recorder: {
    href: "./recorder.html",
    label: "Enregistrement",
    Icon: MicIcon,
    desc: "Enregistrez vos répliques, puis envoyez le fichier au responsable.",
  },
  stats: {
    href: "./stats.html",
    label: "Répartition",
    Icon: PieIcon,
    // « Comparez qui parle le plus » a sauté : la page mesure une pièce, pas les
    // acteurs, et un texte de troupe ne pose pas un classement là où il n'y a
    // qu'une distribution de rôles (le nombre de mots d'un personnage est le
    // fait de l'auteur, pas un mérite). Elle dit donc ce qui se répartit, et le
    // mot reprend le nom de la page.
    // « entre les personnages » est nommé et pas laissé à deviner : sans lui, la
    // phrase disait entre quoi la parole se répartit (des mots, des répliques,
    // des scènes) mais jamais entre QUI, et c'est la question de la page. Et
    // « personnages » et jamais « acteurs » : c'est le mot du script.json et de
    // tout le site (« Qui jouez-vous ? », les couleurs de personnages), et
    // surtout c'est la pièce qui répartit la parole, pas la distribution des
    // rôles ; un acteur peut d'ailleurs tenir deux personnages.
    desc: "Voyez comment la parole se répartit entre les personnages, en mots et en répliques, scène par scène.",
  },
  dashboard: {
    href: "./dashboard.html",
    label: "Avancement",
    Icon: BarsIcon,
    desc: "Suivez l'avancement des enregistrements et déposez les fichiers que vous recevez.",
  },
  editor: {
    href: "./editor.html",
    label: "Édition",
    Icon: QuillIcon,
    desc: "Éditez la pièce : personnages, actes, scènes et répliques.",
  },
};

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
