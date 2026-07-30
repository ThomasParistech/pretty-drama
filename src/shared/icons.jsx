import React from "react";

// Icônes de contrôle en SVG (jamais des emojis : sur mobile ▶/⏸/⏹/⬇ rendaient
// en emoji bleu, hors palette). Toutes héritent la couleur du bouton via
// `currentColor` et se dimensionnent sur la font-size (1em) sauf override CSS.
const svg = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  focusable: false,
};

// Variante « au trait » (par opposition aux formes pleines des contrôles) :
// mêmes réglages de trait pour toutes, sinon les icônes ne pèsent pas pareil
// côte à côte.
const strokeSvg = {
  ...svg,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function PlayIcon() {
  return (
    <svg {...svg} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...svg} fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg {...svg} fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function PrevIcon() {
  return (
    <svg {...svg} fill="currentColor">
      <path d="M15 5v14L6 12z" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg {...svg} fill="currentColor">
      <path d="M9 5v14l9-7z" />
    </svg>
  );
}

export function SkipPrevIcon() {
  return (
    <svg {...svg} fill="currentColor">
      <rect x="5" y="5" width="2.6" height="14" rx="1" />
      <path d="M20 5v14l-9-7z" />
    </svg>
  );
}

export function SkipNextIcon() {
  return (
    <svg {...svg} fill="currentColor">
      <path d="M4 5v14l9-7z" />
      <rect x="16.4" y="5" width="2.6" height="14" rx="1" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M4 9h10a5 5 0 0 1 0 10h-4" />
      <path d="M8 5L4 9l4 4" />
    </svg>
  );
}

export function RedoIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M20 9H10a5 5 0 0 0 0 10h4" />
      <path d="M16 5l4 4-4 4" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M12 4v10" />
      <path d="M8 10l4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

// Réussi / échoué, dans le journal des dépôts de l'Avancement : le statut y
// tient une colonne étroite, donc il est porté par le seul dessin (la cellule
// garde un aria-label, sinon un lecteur d'écran n'a plus rien à lire).
export function CheckIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

// Supprimer une prise d'enregistrement (page Enregistrement). Volontairement
// sans les deux traits verticaux du couvercle habituel : le dessin fait 17 px,
// taille à laquelle ils se referment sur les parois (même raison que
// SparkleIcon, en sens inverse : ici on retire du trait au lieu de passer à
// l'aplat).
export function TrashIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M4 7h16" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l.9 12.1a1.5 1.5 0 001.5 1.4h6.2a1.5 1.5 0 001.5-1.4L17.5 7" />
    </svg>
  );
}

// Recherche (rail de l'Édition) : le cercle et son manche.
export function SearchIcon() {
  return (
    <svg {...strokeSvg}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </svg>
  );
}

// Personnages (rail de l'Édition). UNE tête, alors que la section est au
// pluriel : le dessin fait 18 px, taille à laquelle une seconde tête derrière
// la première n'ajoute qu'une bavure (même leçon que le couvercle retiré de
// TrashIcon). C'est l'infobulle qui dit « Personnages ».
export function PersonIcon() {
  return (
    <svg {...strokeSvg}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

// Structure (rail de l'Édition) : le plan de la pièce, un acte et ses deux
// scènes en retrait. Trois traits, pas quatre : à 18 px un second acte ramène
// l'espacement sous quatre pixels et le dessin redevient une trame (même leçon
// que la seconde tête retirée de PersonIcon). C'est le retrait, et lui seul, qui
// distingue un plan d'un menu.
export function OutlineIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M4 6h16" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
    </svg>
  );
}

// Un seul chevron, qui PIVOTE selon ce qu'il ouvre (et non deux dessins
// échangés) : c'est déjà la règle du chevron de repli du bandeau, pour la même
// raison, le mouvement doit suivre celui du panneau. Il sert au repli du rail
// (tourné d'un quart vers la bande) et au dévoilement du champ de remplacement.
// En SVG et pas le caractère `▼` du bandeau : celui-là ne pivote bien qu'à sa
// taille de texte, et la liste des caractères tolérés du projet est fermée.
export function ChevronIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M7 10l5 5 5-5" />
    </svg>
  );
}

// Correspondance précédente / suivante (recherche de l'Édition). Deux flèches
// verticales, parce qu'on parcourt une liste de haut en bas. Ni ▲/▼ (la liste
// des caractères tolérés est fermée, et ▼ est déjà le vocabulaire du repli sur
// cette page, le même glyphe dirait deux choses), ni SkipPrev/SkipNext (aplat,
// famille réservée aux contrôles de lecture, et horizontales).
export function ArrowUpIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

// Distincte de DownloadIcon, qui porte en plus le trait de réception au sol ;
// les deux ne se côtoient jamais (l'une est dans le bandeau, l'autre dans le
// rail).
export function ArrowDownIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M12 5v14" />
      <path d="M18 13l-6 6-6-6" />
    </svg>
  );
}

// Avertissement : remplace l'emoji ⚠️, qui rendait en couleur pleine (jaune et
// noir) sur mobile comme les ▶/⏸ d'avant, donc hors palette, et dont la
// hauteur variait d'une plateforme à l'autre. Il ne sert qu'en tête de phrase,
// d'où la classe d'alignement portée ici plutôt que par chaque appelant.
export function WarnIcon() {
  return (
    <svg {...strokeSvg} className="warn-icon">
      <path d="M12 4L2.5 20.5h19z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.6h.01" />
    </svg>
  );
}

// Voix de synthèse (Répétition) : remplace l'emoji 🤖, pour la même raison.
// Deux étincelles, la convention du « généré automatiquement », et non plus un
// robot : l'étiquette qui les porte est en 11.5 px, taille à laquelle un dessin
// au trait se referme (le robot n'y était plus qu'une tache). D'où aussi le
// choix de l'aplat plutôt que du trait, seule famille d'icônes du projet dans
// ce cas : il n'y a rien à refermer.
export function SparkleIcon() {
  return (
    <svg {...svg} fill="currentColor" className="tts-icon">
      <path d="M10 6C10.48 10.4 13.6 13.52 18 14C13.6 14.48 10.48 17.6 10 22C9.52 17.6 6.4 14.48 2 14C6.4 13.52 9.52 10.4 10 6Z" />
      <path d="M18.5 1.5C18.77 3.98 20.52 5.73 23 6C20.52 6.27 18.77 8.02 18.5 10.5C18.23 8.02 16.48 6.27 14 6C16.48 5.73 18.23 3.98 18.5 1.5Z" />
    </svg>
  );
}

// ---- Icônes de page (le « sceau » de src/shared/PageMark.jsx) ----
// Une par page, au trait, pour qu'on reconnaisse la page d'un coup d'oeil.
// Les tracés sont repris tels quels dans les favicons des .html : toute
// retouche ici doit y être reportée.

// Accueil, et donc la marque : les deux masques du théâtre.
//
// GÉOMÉTRIE FOURNIE, À NE PAS RETOUCHER. Les 8 tracés viennent tels quels de
// `design/drama-wine.svg` (la livraison design, gardée dans le dépôt pour
// pouvoir comparer), viewBox 329x345 d'origine comprise. Seules les VALEURS de remplissage ont changé,
// pour que la marque suive le système des sceaux au lieu de figer des hex :
// le vin devient `currentColor` (donc `--page-mark`) et les deux aplats
// d'intérieur suivent le fond de la pastille (`--page-mark-soft`).
// Ordre des tracés significatif : contour, puis intérieurs, puis les yeux et
// les bouches par-dessus.
//
// Seul le CADRAGE est retouché, jamais les tracés : dans le fichier livré
// l'encre occupe 259x262 à l'offset (39, 36) d'un viewBox de 329x345, donc le
// dessin est décentré et laisse un anneau inégal dans la pastille. Le viewBox
// ci-dessous le recadre au carré autour de ce même contenu (côté 262, centré
// sur l'encre). Les formes, leurs proportions et leurs transform sont intacts.
//
// Densité : ce dessin demande de la place. Il ne se lit qu'à partir d'environ
// 34 px (à 20 px les deux masques se touchent), d'où la pastille agrandie de
// `.home-brand-mark`. Il ne sert QUE là : les bandeaux des autres pages
// portent le sceau de leur page, pas la marque.
export function MasksIcon() {
  const inner = { fill: "var(--page-mark-soft)" };
  return (
    <svg
      viewBox="37.5 36 262 262"
      width="1em"
      height="1em"
      aria-hidden={true}
      focusable={false}
    >
      <path
        fill="currentColor"
        transform="translate(286.1 56.2)"
        d="M0,0L2,0.7C5.3,2 7.7,3 9.9,5.8C11.2,14.1 9.4,23.2 8.6,31.5L7.9,37.8 7.5,42.2 6.1,57.6 5.6,63.9 5.1,69.9C2.7,96.3 -6.9,121 -27.3,138.6C-40.8,149.9 -58,160.5 -76.1,159.8L-76,163.3C-76.1,185.3 -89.1,207.8 -104.1,222.8C-115.3,233.8 -126.2,240.8 -142.1,241.1C-166.8,240.5 -188.3,228.9 -206,212.3C-222.7,194.6 -229.3,172.7 -234.9,149.6L-239.7,131.8 -240.4,129.7 -241.5,125.8 -244.4,115.7 -245.4,112.2C-246.2,108.5 -246.7,105.6 -246.1,101.8C-241.7,96.9 -235.6,94.1 -229.8,91.1L-226.8,89.5C-204.6,78.3 -175.5,64.8 -150.1,64.8L-150.2,62.9C-150.3,51.2 -149.2,39.7 -148.3,28L-147.6,19.8 -146.7,7.8 -146.5,4.1C-145.6,-5.4 -145.6,-5.4 -142.7,-8.4C-109.1,-31.2 -34.8,-12.7 0,0Z"
      />
      <path
        style={inner}
        transform="translate(177 133)"
        d="M0,0C2,5.8 3.7,11.7 5.3,17.6L6.3,21 12.9,46.4 15.2,55.1C21.4,76.4 18.7,98.6 8.1,118.1C0.3,131.6 -11.5,144.7 -27,149C-45.2,151.3 -63.8,142.8 -78,132.1C-98.4,115.8 -104.8,93.7 -111.1,69.5L-115.8,51.9 -121,32C-109.8,25.1 -98.2,19.9 -86,15L-82.4,13.5C-56.2,3.7 -27.9,-1.2 0,0Z"
      />
      <path
        style={inner}
        transform="translate(280 70)"
        d="M0,0C0.1,8.3 -0.2,16.3 -1,24.6L-1.3,28.1 -2,35.3 -3,46.3 -3.6,53.4 -3.9,56.7C-6.1,80 -15.9,101 -34,116C-44.5,124.2 -57.4,131.6 -71,131L-71.3,128.8C-72.4,120.8 -74.2,113.1 -76.3,105.3L-77,102.9 -77.6,100.8 -78,97C-69.4,96.3 -63.2,97.1 -56,102L-52.2,105.4C-49.7,107.7 -49.4,108 -45.7,108.1C-42.6,106.8 -41.4,106.1 -40,103C-39.9,99.8 -40.4,97.8 -42.3,95.2C-46.8,90.4 -52,87.6 -58,85L-60.2,83.9C-64.5,82.5 -68.8,82.5 -73.3,82.4L-76.1,82.3 -83,82 -83.5,79.9 -85.8,70.5 -86.6,67.2C-88.1,61.3 -89.6,55.6 -92,50C-95.1,48.4 -98.4,48.9 -101.9,48.9L-104.2,48.9 -111.6,48.9 -116.7,49 -129,49C-129.4,39 -128.3,29.1 -127.3,19.1L-126.5,10.3 -126,4.6 -125.7,2 -124,-11C-82,-18.4 -40.2,-13.4 0,0Z"
      />
      <path
        fill="currentColor"
        transform="translate(167 226)"
        d="M0,0C2.9,2.1 2.9,2.1 5,5C5.5,10.9 2.6,14.5 -1,18.9C-7.9,26.2 -17.5,31.6 -27.6,32.2C-38,32.5 -46.5,31.9 -55.2,25.7C-57,23 -57,23 -57,19.4C-55.5,14.4 -55.5,14.4 -53,13C-49,12.5 -46.6,12.7 -42.9,14.5C-36.9,17.4 -28.8,17.1 -22.5,15.3C-16.9,12.7 -13.2,8.4 -9.3,3.8C-6.3,0.2 -4.6,-0.6 0,0Z"
      />
      <path
        fill="currentColor"
        transform="translate(171.2 168.9)"
        d="M0,0C1.8,1.1 1.8,1.1 3.8,3.1C4.4,10 4.4,10 2.8,13.1C-0.5,14.7 -3.5,14.3 -7.2,14.1L-9.2,13.1C-12.9,12.7 -14.6,12.7 -17.7,14.9L-20.1,17.1C-24.7,21 -24.7,21 -29.1,21.3C-33.8,19.4 -33.8,19.4 -35.2,16.1C-35.2,11.3 -34.1,8.1 -30.9,4.5C-21.6,-3.4 -11,-5.3 0,0Z"
      />
      <path
        fill="currentColor"
        transform="translate(233.5 92.9)"
        d="M0,0C3.5,1.1 3.5,1.1 5.9,3.1C9.2,5.6 11.4,5.5 15.4,5.4C17.8,5.2 17.8,5.2 20.5,3.1C24.4,2.6 26.6,2.5 29.9,4.7C32,7.8 32.2,9.4 31.5,13.1C28.3,17.2 24.6,19.9 19.5,21.1C11.8,21.8 4.4,22.5 -1.9,17.6C-8.1,11.7 -8.1,11.7 -9.1,7.5C-7.8,2.5 -5.2,0.1 0,0Z"
      />
      <path
        fill="currentColor"
        transform="translate(173.4 88)"
        d="M0,0C3.6,1 3.6,1 5.9,3.1C9.3,5.5 11.4,5.5 15.5,5.3C18.1,4.9 19.5,3.6 21.6,2C25,2.1 27.5,2.4 30.5,4.1C32.3,7.2 32,9.5 31.6,13C27.8,17.9 23.2,20.6 17,21.5C8.4,21.6 2.2,20.8 -4.4,15C-6.9,12.2 -7.4,11.3 -7.9,7.5C-7.4,4 -7.4,4 -5.9,1.5C-3.4,0 -3.4,0 0,0Z"
      />
      <path
        fill="currentColor"
        transform="translate(114 185)"
        d="M0,0C1.9,1.3 1.9,1.3 3,3C3.5,6.9 3.6,9.1 1.4,12.4C-1.6,14.4 -3.5,14.4 -7,14L-9,13C-11.9,12.7 -14.1,12.5 -17,13C-19.9,15.3 -19.9,15.3 -22,18C-24,20 -24,20 -27.9,20.4C-31.2,20.3 -31.8,20.1 -34.6,17.9C-36,15 -36,15 -36.2,12.2C-34,6.3 -29.8,1.7 -24.4,-1.5C-16.6,-4.9 -7.3,-4.2 0,0Z"
      />
    </svg>
  );
}

// Répétition : deux bulles de dialogue (la pièce lue à plusieurs voix).
export function DialogueIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
      <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
    </svg>
  );
}

// Enregistrement : le micro (autrefois inline dans recorder/App.jsx, avec un
// stroke blanc en dur ; il hérite maintenant la couleur comme les autres).
export function MicIcon() {
  return (
    <svg {...strokeSvg}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 19v3" />
    </svg>
  );
}

// Répartition : le camembert, c'est-à-dire la part de parole de chacun.
//
// Un cercle plus DEUX rayons, et pas un seul : avec un rayon unique le dessin se
// lit comme une horloge. Les deux rayons découpent une part franche, celle que
// les deux camemberts de la page dessinent. Le quart est pris en haut à droite
// parce qu'un camembert commence à midi (les parts de la page aussi).
//
// À ne pas confondre avec `BarsIcon`, juste dessous : les barres sont
// l'Avancement (un remplissage qui progresse), la part est la Répartition (un
// tout qui se partage). Cercle contre barres, la silhouette suffit à 17 px.
export function PieIcon() {
  return (
    <svg {...strokeSvg}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v8.5h8.5" />
    </svg>
  );
}

// Avancement : trois barres montantes.
export function BarsIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M6 20v-5" />
      <path d="M12 20V11" />
      <path d="M18 20V7" />
    </svg>
  );
}

// Édition : la plume qui écrit le texte de la pièce.
export function QuillIcon() {
  return (
    <svg {...strokeSvg}>
      <path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5z" />
      <path d="M16 8L2 22" />
      <path d="M17.5 15H9" />
    </svg>
  );
}

// Les drapeaux des deux endroits où l'on choisit une langue : le sélecteur du
// pied des accueils (la langue du SITE) et celui de la section « Structure » de
// l'Édition (la langue de la PIÈCE).
//
// **Dessinés, jamais l'emoji drapeau.** 🇫🇷 est une paire d'indicatifs
// régionaux : Windows n'en rend aucun et affiche les deux lettres « FR » à la
// place, ce qui ferait du sélecteur une paire de sigles sur la moitié des
// postes de la troupe. La règle « aucun emoji dans l'UI » (cf. la ligne
// « Icônes » de CLAUDE.md) s'applique donc ici aussi, et les couleurs sont
// codées en dur parce qu'un drapeau ne suit pas la palette du site : c'est la
// seule image du dépôt qui ne soit pas en `currentColor`.
//
// **Deux drapeaux, une seule boîte, 3:2.** L'Union Jack fait 2:1 dans la
// réalité : il est étiré à la verticale (`scale(1 4/3)`, appliqué à sa
// géométrie canonique en 60x30 plutôt que redessiné à la main). Deux vignettes
// de largeurs différentes côte à côte dans un sélecteur se lisent comme un
// défaut d'alignement, alors qu'un drapeau un tiers plus haut que nature reste
// reconnu de tous.
//
// Le drapeau britannique pour l'anglais, et pas celui d'un autre pays
// anglophone : c'est celui que porte la quasi-totalité des sélecteurs de langue
// de ce côté-ci de l'Atlantique. Un drapeau nomme un pays et pas une langue, ce
// qui reste vrai et assumé : le nom de la langue voyage avec, en `title` et en
// nom accessible, jamais remplacé par l'image.
//
// La taille, le coin arrondi et le filet vivent dans `.flag-icon` (theme.css) :
// sans filet, la bande blanche du tricolore et le fond blanc de l'Union Jack se
// fondent dans le papier crème et le drapeau perd un bord.
export function FlagIcon({ locale }) {
  // Les `clipPath` de l'Union Jack sont référencés par id, donc deux drapeaux
  // sur la même page en dupliqueraient un. `useId` les rend uniques ; les
  // deux-points qu'il produit sont retirés, un id en contient légalement mais
  // les analyseurs d'URL des vieux moteurs s'y perdent.
  const uid = React.useId().replace(/:/g, "");
  const box = { viewBox: "0 0 60 40", className: "flag-icon", "aria-hidden": true, focusable: false };

  if (locale === "en") {
    return (
      <svg {...box}>
        <g transform="scale(1 1.3333)">
          <clipPath id={`${uid}-flag`}>
            <path d="M0,0 v30 h60 v-30 z" />
          </clipPath>
          {/* Les quatre quartiers où la diagonale rouge est décalée (le
              contre-changement de l'Union Jack : sans lui, les deux croix de
              Saint-Patrick et de Saint-André se superposent au lieu de
              s'entrelacer). */}
          <clipPath id={`${uid}-counter`}>
            <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
          </clipPath>
          <g clipPath={`url(#${uid}-flag)`}>
            <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
            <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
            <path
              d="M0,0 L60,30 M60,0 L0,30"
              clipPath={`url(#${uid}-counter)`}
              stroke="#c8102e"
              strokeWidth="4"
            />
            <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
            <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
          </g>
        </g>
      </svg>
    );
  }

  return (
    <svg {...box}>
      <path d="M0 0h20v40H0z" fill="#002395" />
      <path d="M20 0h20v40H20z" fill="#fff" />
      <path d="M40 0h20v40H40z" fill="#ed2939" />
    </svg>
  );
}
