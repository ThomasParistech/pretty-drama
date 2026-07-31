// Le calcul de la page Répartition : qui parle, combien, et quand.
//
// Module PUR (ni React, ni DOM, ni fetch), et c'est délibéré : le projet ne
// teste aucun composant React, donc tout ce qui peut se tromper doit vivre ici
// pour que `node --test` le rejoue (cf. stats.test.js). Ce qui reste dans
// App.jsx ne fait que dessiner ce que ce module a compté.
//
// Trois sorties, une par panneau de la page : la répartition des mots, celle des
// répliques (les deux camemberts), et la suite des tronçons colorés du bloc
// « chronologie du dialogue ».
//
// **Portage de la visualisation d'origine** (dépôt theatre_transport_de_femme,
// `viz/generate_viz.py`). Un écart assumé avec elle :
//
//  - elle FUSIONNAIT les répliques consécutives d'un même personnage avant de
//    compter, donc son camembert des répliques comptait des prises de parole et
//    pas des répliques. Ici le camembert compte les répliques du script.json,
//    l'unité que tout le site emploie (statuts, clips, comptes du rail). La
//    fusion ne sert QUE le bloc, où deux répliques voisines du même personnage
//    donneraient deux rectangles de la même couleur collés.
//
// La largeur du bloc, elle, est FIXE comme chez elle (cf. `DEFAULT_COLUMNS`) : un
// temps dérivée du nombre de mots de la portée, elle donnait des carrés de
// tailles différentes d'une scène à l'autre, donc des blocs incomparables.

// Nombre de mots d'un texte. Même découpage que le `re.findall(r'\w+')` de la
// référence : les apostrophes séparent, donc « l'crâne » compte deux mots. Ça
// gonfle un peu les totaux dans l'absolu, mais la page n'affiche que des
// PROPORTIONS, et c'est le même gonflement pour tout le monde ; en échange les
// chiffres du site et ceux du PDF de la troupe concordent.
//
// Tolérant par contrat : le manifest peut être hand-édité, une réplique sans
// texte compte zéro et ne fait pas planter la page.
export function countWords(text) {
  if (typeof text !== "string") return 0;
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

// ---------------------------------------------------------------- la portée

// La portée « toute la pièce » et « tout l'acte », comme les selects du bandeau
// les proposent. Un rang à -1 vaut « tout ce niveau ».
export const ALL = -1;

// Tout ce qui n'est pas un rang utilisable vaut « tout ce niveau », et pas
// seulement -1 : sans ça, -1 rendait la pièce entière alors que -5 retombait
// silencieusement sur la première scène, et un NaN (un `Number("")` venu d'un
// select) ne rendait rien du tout.
const isAll = (index) => !Number.isInteger(index) || index < 0;

// Rang ramené dans les bornes de la liste, jamais un accès optimiste : un
// manifest rechargé sous un rang devenu trop grand rendrait `undefined`, et la
// page se lirait comme vide au lieu de retomber sur une scène existante
// (idiome de src/editor/App.jsx).
const clampIndex = (index, length) => Math.max(0, Math.min(index, length - 1));

// Les répliques de la portée choisie, dans l'ordre de la pièce. Cet ordre est la
// seule information que le bloc porte en plus des couleurs : c'est une
// chronologie.
export function scopeLines(manifest, actIndex = ALL, sceneIndex = ALL) {
  const acts = Array.isArray(manifest?.acts) ? manifest.acts : [];
  if (acts.length === 0) return [];

  const scenesOf = (act) => (Array.isArray(act?.scenes) ? act.scenes : []);
  const linesOf = (scene) => (Array.isArray(scene?.lines) ? scene.lines : []);

  if (isAll(actIndex)) return acts.flatMap((act) => scenesOf(act).flatMap(linesOf));

  const scenes = scenesOf(acts[clampIndex(actIndex, acts.length)]);
  if (isAll(sceneIndex) || scenes.length === 0) return scenes.flatMap(linesOf);
  return linesOf(scenes[clampIndex(sceneIndex, scenes.length)]);
}

// La portée choisie, en RANGS et non en mots : les trois panneaux et les deux
// camemberts la nomment toujours pareil, mais c'est l'appelant qui la met en
// phrase, avec la locale du lecteur (cf. `scopeText` dans App.jsx et
// src/shared/structureLabels.js).
//
// Deux choses tombent avec ce changement. Les actes et les scènes n'ont plus de
// titre, donc il n'y a plus rien à recopier ni de repli élidé (« l'acte », « la
// scène ») à porter ici. Et ce module reste PUR : un libellé traduit demanderait
// un `t`, alors qu'un rang ne demande rien, ce qui garde `stats.test.js` au
// `node --test`.
//
// `kind` dit à quel niveau on est, et les rangs sont déjà bornés : l'appelant
// n'a plus à re-vérifier qu'un acte existe.
export function scopeOf(manifest, actIndex = ALL, sceneIndex = ALL) {
  const acts = Array.isArray(manifest?.acts) ? manifest.acts : [];
  if (isAll(actIndex) || acts.length === 0) return { kind: "all" };
  const ai = clampIndex(actIndex, acts.length);
  const scenes = Array.isArray(acts[ai]?.scenes) ? acts[ai].scenes : [];
  if (isAll(sceneIndex) || scenes.length === 0) return { kind: "act", actIndex: ai };
  return { kind: "scene", actIndex: ai, sceneIndex: clampIndex(sceneIndex, scenes.length) };
}

// ------------------------------------------------------------- les décomptes

// Personnage inconnu : `characterId` nul, ou qui ne désigne aucun personnage de
// la distribution. Ces répliques existent (un script hand-édité, un personnage
// supprimé dans un fichier repris à la main) et elles ne sont PAS fondues dans
// le total en silence, précédent de la grille de l'Avancement : elles ont leur
// ligne, à part, sous un libellé qui dit ce qu'elles sont.
//
// C'est un SEAU, pas un id : il sert de clé de regroupement et de valeur de
// comparaison (`row.id`, `rect.characterId`, le personnage isolé), jamais de
// texte affiché, le libellé de sa ligne étant posé par l'appelant (`nameOf`).
// Les parenthèses le tiennent hors de `SAFE_ID` (`^[0-9a-zA-Z-]{1,64}$`), donc
// aucun id minté par l'éditeur ne peut lui ressembler. Il reste une chaîne et
// pas un `Symbol`, qui rendrait la collision impossible mais que React refuse :
// `key={row.id}` sur un Symbol lève « Cannot convert a Symbol value to a
// string ». Et surtout aucun caractère invisible dedans : un NUL dans la source
// fait passer tout le fichier pour un binaire aux yeux de git, qui n'en montre
// alors plus jamais le diff.
export const UNKNOWN = "(inconnu)";

// La distribution, par id. Le nom peut manquer (le sanitize Python ne l'exige
// pas), c'est l'appelant qui pose le libellé de repli.
const knownNames = (characters) => {
  const known = new Map();
  for (const c of Array.isArray(characters) ? characters : []) {
    if (c && typeof c.id === "string" && c.id) known.set(c.id, c.name);
  }
  return known;
};

// Le seau d'une réplique : son personnage, ou UNKNOWN. **Une seule
// implémentation**, partagée par les décomptes et par le bloc, et c'est elle qui
// les tient d'accord : quand chacun jugeait « inconnu » à sa façon (les
// décomptes contre la distribution, le bloc sur la seule forme du
// `characterId`), isoler « Personnage inconnu » dans la légende du bloc
// comparait un seau à un id brut, donc éteignait TOUS les tronçons, y compris
// ceux qu'on venait de demander.
const bucketOf = (line, known) =>
  typeof line.characterId === "string" && known.has(line.characterId)
    ? line.characterId
    : UNKNOWN;

// Répartition des mots et des répliques sur la portée.
//
// `rows` est trié par mots décroissants, comme les camemberts de la référence
// (`argsort` sur les décomptes) : le camembert se lit du plus bavard au moins
// bavard, et la légende suit le même ordre que les parts. Un personnage sans
// aucune réplique dans la portée n'y figure pas du tout, sinon la légende d'une
// scène à deux personnages listerait la distribution entière.
export function speechStats(lines, characters) {
  const known = knownNames(characters);

  const tally = new Map();
  const bump = (id, words) => {
    const row = tally.get(id) ?? { id, name: known.get(id) ?? null, words: 0, lines: 0 };
    row.words += words;
    row.lines += 1;
    tally.set(id, row);
  };

  let totalWords = 0;
  let totalLines = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line !== "object") continue;
    const words = countWords(line.text);
    bump(bucketOf(line, known), words);
    totalWords += words;
    totalLines += 1;
  }

  const rows = [...tally.values()].sort((a, b) => b.words - a.words || b.lines - a.lines);
  return { rows, totalWords, totalLines };
}

// ------------------------------------------------------ le centre de l'anneau

// Le total et son unité sont écrits DANS le trou de l'anneau, en unités du
// viewBox (100 x 100), donc leur taille doit dépendre de ce qu'on écrit : à
// taille figée, une troupe dont la pièce passe les 99 999 mots pousse son total
// sous l'anneau, et l'unité la plus longue (« répliques ») y touche déjà les
// bords. Le trou mesure 63 unités de diamètre (rayon 38, trait de 13), mais un
// texte posé au-dessus du centre n'a jamais le diamètre pour lui : à 15 unités
// du centre, là où passe le haut des chiffres, la corde ne fait plus que 55.
// C'est donc 54 qu'on peut promettre aux deux lignes.
const CENTER_WIDTH = 54;

// Chasse moyenne d'un caractère, en fraction de la taille de police. 0,62 est
// mesuré sur les chiffres de la font UI, rendus en `tabular-nums` donc tous de
// la même largeur ; les minuscules de l'unité sont plus étroites, et la marge
// joue dans le bon sens (on rétrécit un peu trop tôt, jamais trop tard).
const CHAR_WIDTH = 0.62;

// Le séparateur de milliers ne compte PAS pour un chiffre. Depuis que le total
// passe par `fmt.number`, la ligne du centre porte une insécable étroite en
// français (« 10 307 ») et une virgule en anglais (« 10,307 ») : à pleine chasse,
// ces caractères faisaient tomber le total de la pièce publiée de 17 à 14,5
// unités, un rétrécissement de 15 % pour une ligne qui ne s'élargit que de 6 %.
// C'est la seule raison pour laquelle ce calcul regarde ce qu'il y a DANS la
// chaîne au lieu de compter ses caractères. 0,2 est une borne haute mesurée sur
// la virgule, le plus large des trois, donc la marge joue toujours dans le bon
// sens (on rétrécit un peu trop tôt, jamais trop tard).
const THIN_CHAR = /[\s\u00a0\u202f.,]/;
const THIN_WIDTH = 0.2;

// Les deux tailles nominales, celles auxquelles les deux lignes sont dessinées
// quand elles tiennent. Elles vivent ici et pas dans stats.css parce que c'est
// ce module qui décide de les réduire : le même chiffre écrit aux deux endroits
// se désaccorderait au premier réglage.
export const TOTAL_SIZE = 17;
export const UNIT_SIZE = 9.5;

// La taille à laquelle `text` tient dans le trou de l'anneau, jamais plus grande
// que sa taille nominale : les nombres et les unités d'aujourd'hui sont donc
// rendus exactement comme avant, et seul un texte trop long rétrécit.
export function centerFontSize(text, nominal) {
  const written = String(text ?? "");
  if (written.length === 0) return nominal;
  let width = 0;
  for (const char of written) width += THIN_CHAR.test(char) ? THIN_WIDTH : CHAR_WIDTH;
  return Math.min(nominal, CENTER_WIDTH / width);
}

// ------------------------------------------------------------------- le bloc

// Le nombre de mots par rangée du bloc : **une constante, et un réglage.**
//
// Il ne se dérive PLUS du nombre de mots de la portée. Cette largeur dérivée
// donnait à chaque scène une forme flatteuse, deux fois plus large que haute, mais
// au prix d'un carré qui changeait de taille d'une portée à l'autre, donc de deux
// blocs qui ne se comparaient pas : une scène de 300 mots et la pièce entière
// remplissaient la même carte, et rien ne disait laquelle était longue. À nombre
// de mots par rangée constant, un carré fait la même taille partout et la HAUTEUR
// du bloc dit la longueur. C'est d'ailleurs ce que faisait la référence Python
// (`generate_viz.py` : `w=50` par scène, `w=100` pour la pièce) : on y revient, à
// ceci près qu'il n'y a plus qu'un seul chiffre, le même pour toutes les portées.
// La forme dérivée était même chez elle, en ligne commentée juste au-dessus
// (`# h = w = math.ceil(math.sqrt(count_words))`) : elle l'avait abandonnée.
//
// Il se règle, parce qu'une troupe n'a pas la pièce de celle-ci : un chiffre qui
// va à 10 000 mots donne un ruban de deux rangées sur une pièce de 500 et un mur
// de plusieurs écrans sur une pièce de 30 000.
//
// **100 par défaut, la valeur de la référence** (`generate_viz.py` : `w=100` pour
// `all_image.svg`, `w=50` par scène) : c'est le même document que le PDF de la
// troupe, servi à l'écran, donc son bloc se lit à la largeur où elle l'a toujours
// lu. Ça tombe bien par ailleurs : 100 colonnes dans une carte de 820 px donnent
// 800 px de bloc et un carré de 8 px pile, soit 103 rangées pour la pièce entière.
// 120 a été le défaut un temps, mais ce n'était que le plafond de l'ancienne
// formule dérivée, un chiffre sans origine.
//
// Le plancher de 50 est lui aussi de la référence, c'est sa largeur PAR SCÈNE : les
// deux seules valeurs qu'elle employait sont donc le défaut et la borne basse, et
// la course ne fait que les prolonger.
//
// Les deux bornes tiennent par ailleurs à une seule arithmétique, le côté d'un
// carré = largeur utile de la carte / nombre de colonnes. Sur la mise en page la
// plus large, 820 px : 50 colonnes donnent 16 px de côté, 200 en donnent 4. En
// dessous de 50,
// le bloc cesse d'être une mosaïque pour devenir une pile de barres (34 px de côté
// à 24 colonnes, le plancher d'avant) et une réplique moyenne occupe plusieurs
// rangées, donc on ne lit plus l'alternance des voix. Au-delà de 200, les tronçons
// courts commencent à disparaître : c'est déjà un bloc de 52 rangées pour la pièce
// entière, et sur un téléphone (238 px de carte) le carré y descend à 1 px, donc le
// haut de la course est un réglage d'ordinateur. Un plafond de 250 a été essayé et
// retiré, la course cessant de servir bien avant.
//
// Le pas de 5 sert le glissement (à 1, une flèche du clavier déplace le bloc d'un
// mot par rangée, ce qui ne se voit pas) et il tombe juste sur les trois chiffres
// qui comptent, les deux bornes et le défaut : une valeur hors de la grille du pas
// ferait sauter le premier appui sur une flèche.
export const MIN_COLUMNS = 50;
export const MAX_COLUMNS = 200;
export const DEFAULT_COLUMNS = 100;
export const COLUMNS_STEP = 5;

// Le réglage ramené dans ses bornes. Le curseur ne peut pas en sortir, mais c'est
// lui qui alimente le viewBox du dessin, et `blockRects` ne se défend que du zéro
// et du négatif : une valeur hors bornes ferait un bloc illisible plutôt qu'une
// erreur, ce qui est exactement le genre de panne qu'on ne voit pas.
export function clampColumns(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, n));
}

// Les tronçons du bloc : les mots de la portée mis à la file, repliés tous
// `columns` mots, découpés à chaque changement de rangée.
//
// Un rectangle par tronçon et pas un par mot : la pièce entière fait près de
// 10 000 mots, donc autant d'éléments SVG, alors que les tronçons se comptent en
// centaines (une réplique, plus une coupe par rangée traversée). Les répliques
// consécutives d'un même personnage sont fusionnées d'abord : elles seraient
// adjacentes et de la même couleur.
//
// Une réplique sans mot (texte vide) n'occupe aucun carré, donc ne produit rien.
// La dernière rangée reste incomplète, comme les `NaN` de la référence.
//
// `characters` sert au même seau que `speechStats` (cf. `bucketOf`) : les
// tronçons portent donc les identités que la légende affiche, ce qui est ce qui
// permet d'en isoler une. Sans la distribution, le bloc ne saurait pas
// distinguer un personnage supprimé d'un personnage de la pièce.
export function blockRects(lines, columns, characters) {
  const width = Math.max(1, Math.trunc(columns) || 1);
  const known = knownNames(characters);

  // Fusion des voisines du même personnage. Deux orphelines voisines fusionnent
  // donc aussi, même sous des `characterId` différents : elles sont du même seau
  // et de la même couleur, donc deux tronçons collés au lieu d'un.
  const runs = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line !== "object") continue;
    const words = countWords(line.text);
    if (words === 0) continue;
    const id = bucketOf(line, known);
    const last = runs[runs.length - 1];
    if (last && last.characterId === id) last.words += words;
    else runs.push({ characterId: id, words });
  }

  const rects = [];
  let cursor = 0; // rang du mot courant dans la suite repliée
  for (const run of runs) {
    let left = run.words;
    while (left > 0) {
      const column = cursor % width;
      const take = Math.min(left, width - column);
      rects.push({
        x: column,
        y: Math.floor(cursor / width),
        width: take,
        characterId: run.characterId,
      });
      cursor += take;
      left -= take;
    }
  }

  return { rects, columns: width, rows: Math.max(1, Math.ceil(cursor / width)), words: cursor };
}
