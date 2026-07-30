// La couleur d'un personnage : la palette, son attribution, et la seule
// dérivation qu'on en fasse. Module PUR (ni React, ni DOM, ni reducer), donc
// entièrement rejoué par `node --test` (cf. characterColors.test.js).
//
// **D'où vient la palette.** C'est Tableau 10, la palette catégorielle
// canonique : `tab10` sous matplotlib, `schemeCategory10` sous D3. La
// visualisation d'origine de la troupe (dépôt theatre_transport_de_femme,
// `viz/generate_viz.py`) employait `sns.color_palette("bright", 10)`, qui n'est
// pas une autre palette mais un autre REGISTRE de celle-ci : les six variantes
// de seaborn (deep, muted, pastel, bright, dark, colorblind) ont les mêmes dix
// emplacements dans le même ordre (bleu, orange, vert, rouge, violet, brun,
// rose, gris, olive, cyan) et ne diffèrent que par la saturation et la clarté.
// On garde le registre canonique parce qu'il sépare MIEUX ses propres couleurs
// que `bright` (écart minimal de ΔE 27.7 contre 24.8) tout en étant moins
// criard : `bright` paie son étendue de clarté en descendant son jaune à
// 1.48:1 sur le crème du site, ce qui passe pour une part de camembert et pas
// pour une pastille de légende.
//
// **Pourquoi la palette précédente ne pouvait pas servir.** Elle rendait
// `oklch(0.58 0.14 H)`, donc à clarté FIXE : ses douze teintes ne différaient
// que par la teinte, soit une étendue de L* de 6 points et un écart minimal de
// ΔE 15.9. Sur un bloc d'un pixel par mot (page Répartition), deux voisines s'y
// confondaient. La clarté qui varie est ce qui fait le travail, pas la teinte.
//
// **Les dix premières, puis les dix claires.** `tab20` est l'extension
// officielle de la même palette, et ses entrées paires SONT `tab10` à
// l'identique. D'où l'ordre ci-dessous : toute troupe jusqu'à dix personnages
// reçoit Tableau 10 à pleine force et ne voit jamais une teinte pâle, et chaque
// claire reste franchement distincte de sa foncée (ΔE 22 à 46), donc le bleu ne
// se lit jamais comme le bleu clair. Au-delà de dix l'ensemble faiblit
// (ΔE 16.6), au-delà de vingt il boucle : dégradation bornée, et seule une
// troupe plus grande que celle d'aujourd'hui la paie.
//
// **La couleur est stockée, ce n'est plus une teinte.** Le personnage porte
// `color: "#1f77b4"` dans script.json. Une teinte ne pouvait pas indexer cette
// palette : `#ff7f0e` et `#8c564b` sont deux registres du même angle, et
// `#7f7f7f` n'a pas d'angle du tout.
export const CHARACTER_COLORS = [
  // Tableau 10, dans son ordre.
  "#1f77b4", // bleu
  "#ff7f0e", // orange
  "#2ca02c", // vert
  "#d62728", // rouge
  "#9467bd", // violet
  "#8c564b", // brun
  "#e377c2", // rose
  "#7f7f7f", // gris
  "#bcbd22", // olive
  "#17becf", // cyan
  // Les dix claires de tab20, dans le même ordre de teinte.
  "#aec7e8",
  "#ffbb78",
  "#98df8a",
  "#ff9896",
  "#c5b0d5",
  "#c49c94",
  "#f7b6d2",
  "#c7c7c7",
  "#dbdb8d",
  "#9edae5",
];

// Nom de chaque couleur, dans l'ordre de `CHARACTER_COLORS`. Sert à NOMMER les
// pastilles de la palette de l'éditeur : sans lui, les vingt boutons portaient
// tous « Choisir cette couleur », donc au clavier et au lecteur d'écran la
// palette était vingt boutons homonymes dont la seule information, la couleur,
// n'était pas dite. Les dix dernières sont les teintes claires de tab20, d'où le
// « clair » qui les distingue de leur foncée.
export const CHARACTER_COLOR_NAMES = [
  "Bleu",
  "Orange",
  "Vert",
  "Rouge",
  "Violet",
  "Brun",
  "Rose",
  "Gris",
  "Olive",
  "Cyan",
  "Bleu clair",
  "Orange clair",
  "Vert clair",
  "Rouge clair",
  "Violet clair",
  "Brun clair",
  "Rose clair",
  "Gris clair",
  "Olive clair",
  "Cyan clair",
];

const PALETTE = new Set(CHARACTER_COLORS);

// Une couleur du personnage telle qu'elle peut être STOCKÉE : la palette, et
// rien d'autre. Sert à décider s'il faut réparer, jamais à afficher.
export function isPaletteColor(value) {
  return typeof value === "string" && PALETTE.has(value.toLowerCase());
}

// Première couleur libre, en repartant du début quand la palette est épuisée.
// `used` est un Set de couleurs déjà prises.
//
// `assignedCount` est le nombre de personnages DÉJÀ servis, et il est nécessaire :
// une fois la palette épuisée, `used` ne grandit plus, donc s'en servir pour
// choisir le repli donnait la même couleur à tous les personnages au-delà du
// vingtième (le 21e comme le 25e repartaient sur le premier bleu). Avec le
// compte, la palette boucle vraiment.
export function firstFreeColor(used, assignedCount = used.size) {
  return (
    CHARACTER_COLORS.find((c) => !used.has(c)) ??
    CHARACTER_COLORS[assignedCount % CHARACTER_COLORS.length]
  );
}

// Couleur de chaque personnage, par id. Déterministe et sans état : une couleur
// déjà valide et encore libre est gardée, tout le reste (absente, étrangère,
// dupliquée) reçoit la première libre.
//
// C'est le MÊME comblement que `sanitizeScript` (src/editor/reducer.js) applique
// au chargement de script.json, et c'est ce qui fait que l'Édition et la
// Répartition montrent exactement les mêmes couleurs : le script publié n'a pas
// forcément de couleurs (le fichier de la troupe n'en avait aucune avant ce
// changement), et les deux pages les comblent identiquement au lieu d'attendre
// que le responsable retélécharge le script depuis l'éditeur.
export function assignColors(characters) {
  const used = new Set();
  const byId = new Map();
  for (const c of Array.isArray(characters) ? characters : []) {
    if (!c || typeof c !== "object" || typeof c.id !== "string" || !c.id) continue;
    if (byId.has(c.id)) continue;
    const color =
      isPaletteColor(c.color) && !used.has(c.color.toLowerCase())
        ? c.color.toLowerCase()
        : firstFreeColor(used, byId.size);
    used.add(color);
    byId.set(c.id, color);
  }
  return byId;
}

// Couleur STOCKÉE d'un personnage désigné par son id, ou `null` quand l'id est
// inconnu (ou quand la couleur n'est pas de la palette). Le repli, un token
// neutre, appartient à l'appelant : le gris de l'éditeur n'est pas celui de la
// légende d'un camembert.
//
// Simple recherche, sans comblement : c'est l'appel des consommateurs dont les
// personnages portent DÉJÀ leur couleur, l'éditeur en tête (`sanitizeScript` la
// garantit sur chaque personnage au chargement), et il est appelé une fois par
// rangée de réplique. Qui lit un manifest, où la couleur peut manquer, appelle
// `assignColors` une seule fois et garde la Map.
export function characterColor(characters, id) {
  const character = (Array.isArray(characters) ? characters : []).find((c) => c && c.id === id);
  return character && isPaletteColor(character.color) ? character.color.toLowerCase() : null;
}

// Clarté maximale d'une couleur qui porte du TEXTE. Mesurée : à 0.5 les vingt
// couleurs sont au-dessus de 5:1 sur le crème (5.01) comme sur le blanc (5.40),
// donc au niveau d'`--ink-soft`, que le projet tient pour le minimum d'un texte
// informatif. Monter à 0.52 retombe à 4.63, trop près du seuil de 4.5 pour une
// palette qu'on pourra retoucher.
const INK_MAX_LIGHTNESS = 0.5;

// La même couleur, assez foncée pour porter du TEXTE ou un filet.
//
// La palette est faite d'aplats : la référence ne s'en sert que pour des parts
// de camembert et des pixels, et sur le crème du site (`--paper` #faf6ef) son
// olive est à 1.87:1, son jaune pâle à 1.34:1. Or l'éditeur en peint du texte
// (le select de personnage, le nom d'un résultat de recherche).
//
// **On PLAFONNE la clarté, on ne mélange pas avec du noir.** Un
// `color-mix(… 60%, #000)` a été essayé d'abord : il tient le contraste (4.97 au
// minimum) mais il multiplie la clarté ET la chroma, donc il éteint la couleur
// en même temps qu'il la fonce. Le bleu #1f77b4 y tombait à une chroma de 0.074
// et le nom du personnage se lisait comme du noir dans l'éditeur, où la couleur
// est justement le seul repère qui distingue une réplique d'une autre. Le
// plafond de clarté garde la chroma d'origine (0.124 pour le même bleu, soit du
// bleu franc) et donne un MEILLEUR contraste (5.01 au minimum), parce qu'il
// ramène toutes les couleurs à la même clarté au lieu de foncer d'autant les
// sombres, déjà lisibles.
//
// Dérivé et pas une seconde liste écrite à la main : vingt hex de plus à tenir
// synchrones seraient vingt occasions de dériver.
//
// La syntaxe de couleur relative (`oklch(from …)`) est disponible partout depuis
// 2024, et son repli est sans danger : une déclaration invalide est ignorée, donc
// le texte garde la couleur héritée et reste lisible, il perd seulement son
// codage par personnage.
export function characterInk(color) {
  return `oklch(from ${color} min(l, ${INK_MAX_LIGHTNESS}) c h)`;
}
