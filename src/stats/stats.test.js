// Tests du calcul de la page Répartition.
//
// C'est de la logique pure, sans React ni DOM : `node --test` la joue telle
// quelle. Ce qui se teste ici est exactement ce qui ne se relit pas à l'œil : le
// repliement du bloc (une réplique à cheval sur trois rangées doit donner trois
// rectangles dont les largeurs REDONNENT son compte de mots, sinon le dessin
// mentirait sans qu'on puisse le voir), le bornage des portées, et le sort des
// répliques dont le personnage a disparu.
import test from "node:test";
import assert from "node:assert/strict";


import {
  ALL,
  COLUMNS_STEP,
  DEFAULT_COLUMNS,
  MAX_COLUMNS,
  MIN_COLUMNS,
  TOTAL_SIZE,
  UNIT_SIZE,
  UNKNOWN,
  blockRects,
  centerFontSize,
  clampColumns,
  countWords,
  scopeOf,
  scopeLines,
  speechStats,
} from "./stats.js";

const line = (characterId, text) => ({ id: `l-${characterId}-${text.length}`, characterId, text });

const CHARACTERS = [
  { id: "c-serge", name: "Serge" },
  { id: "c-annie", name: "Annie" },
];

const MANIFEST = {
  acts: [
    {
      title: "Acte I",
      scenes: [
        { title: "Scène 1", lines: [line("c-serge", "un deux trois")] },
        { title: "Scène 2", lines: [line("c-annie", "quatre cinq")] },
      ],
    },
    { title: "Acte II", scenes: [{ title: "Scène 1", lines: [line("c-serge", "six")] }] },
  ],
};

// ----------------------------------------------------------------- countWords

test("countWords découpe comme la référence Python, apostrophes comprises", () => {
  assert.equal(countWords("Silence! C'est moi le chef ici."), 7, "« C'est » compte deux mots");
  assert.equal(countWords("Mettez‑vous ça dans l'crâne."), 6, "le tiret typographique sépare aussi");
  assert.equal(countWords("un"), 1);
});

test("countWords ignore la ponctuation et compte les accents comme des lettres", () => {
  assert.equal(countWords("... !? -- «»"), 0);
  assert.equal(countWords("Éléonore où être"), 3);
  assert.equal(countWords("Acte 2 scène 10"), 4, "les nombres sont des mots");
});

test("countWords rend zéro sur tout ce qui n'est pas un texte", () => {
  // Le manifest peut être hand-édité : une réplique sans texte ne doit pas
  // planter la page entière.
  for (const raw of [null, undefined, 42, [], {}, ""]) {
    assert.equal(countWords(raw), 0, `entrée : ${JSON.stringify(raw)}`);
  }
});

// ----------------------------------------------------------------- scopeLines

test("scopeLines rend toute la pièce, tout un acte, ou une scène", () => {
  assert.equal(scopeLines(MANIFEST, ALL, ALL).length, 3);
  assert.equal(scopeLines(MANIFEST, 0, ALL).length, 2, "l'acte I en entier");
  assert.equal(scopeLines(MANIFEST, 0, 1)[0].characterId, "c-annie");
  assert.equal(scopeLines(MANIFEST, 1, 0)[0].characterId, "c-serge");
});

test("scopeLines garde l'ordre de la pièce, pas un ordre de scène", () => {
  // Le bloc est une CHRONOLOGIE : l'ordre est la seule information qu'il porte
  // en plus des couleurs.
  assert.deepEqual(
    scopeLines(MANIFEST, ALL, ALL).map((l) => l.text),
    ["un deux trois", "quatre cinq", "six"]
  );
});

test("scopeLines borne les rangs au lieu de rendre du vide", () => {
  // Un manifest rechargé sous un rang devenu trop grand : la page doit retomber
  // sur une scène existante, pas se lire comme vide.
  assert.equal(scopeLines(MANIFEST, 99, 99).length, 1);
  // Tout rang inutilisable vaut « tout ce niveau », et pas seulement -1 : sinon
  // -1 rendait la pièce entière et -5 retombait en silence sur la première
  // scène, deux comportements pour une même erreur.
  assert.equal(scopeLines(MANIFEST, -5, -5).length, 3);
  assert.equal(scopeLines(MANIFEST, NaN, NaN).length, 3, "un Number(\"\") venu d'un select");
  assert.equal(scopeLines(MANIFEST, 0, 1.5).length, 2, "un rang non entier n'indexe rien");
});

test("scopeLines encaisse un manifest absent ou difforme", () => {
  for (const raw of [null, undefined, {}, { acts: null }, { acts: [] }, { acts: [{}] }, 42]) {
    assert.deepEqual(scopeLines(raw, ALL, ALL), [], `manifest : ${JSON.stringify(raw)}`);
  }
  assert.deepEqual(scopeLines({ acts: [{ scenes: [{ lines: null }] }] }, 0, 0), []);
});

// -------------------------------------------------------------------- scopeOf

test("scopeOf rend le NIVEAU et les rangs, pas une phrase", () => {
  // C'est l'appelant qui met la portée en mots, avec la locale du lecteur : ici
  // on ne rend que des rangs, ce qui garde ce module pur et testable tel quel.
  assert.deepEqual(scopeOf(MANIFEST, ALL, ALL), { kind: "all" });
  assert.deepEqual(scopeOf(MANIFEST, 0, ALL), { kind: "act", actIndex: 0 });
  assert.deepEqual(scopeOf(MANIFEST, 0, 1), { kind: "scene", actIndex: 0, sceneIndex: 1 });
});

test("scopeOf borne ses rangs, donc l'appelant n'a rien à revérifier", () => {
  assert.deepEqual(scopeOf(MANIFEST, 99, 99).kind, "scene");
  const scoped = scopeOf(MANIFEST, 99, 99);
  assert.ok(scoped.actIndex < MANIFEST.acts.length);
  assert.ok(scoped.sceneIndex < MANIFEST.acts[scoped.actIndex].scenes.length);
});

test("scopeOf retombe sur la pièce entière plutôt que sur un acte fantôme", () => {
  assert.deepEqual(scopeOf(null, ALL, ALL), { kind: "all" });
  assert.deepEqual(scopeOf({ acts: [] }, 0, 0), { kind: "all" });
  // Un acte sans scène : on reste au niveau de l'acte au lieu de désigner une
  // scène qui n'existe pas.
  assert.deepEqual(scopeOf({ acts: [{ scenes: [] }] }, 0, 0), { kind: "act", actIndex: 0 });
});

// ---------------------------------------------------------------- speechStats

test("speechStats compte les mots et les répliques par personnage", () => {
  const { rows, totalWords, totalLines } = speechStats(
    [line("c-serge", "un deux trois"), line("c-annie", "quatre"), line("c-serge", "cinq six")],
    CHARACTERS
  );
  assert.equal(totalWords, 6);
  assert.equal(totalLines, 3);
  const serge = rows.find((r) => r.id === "c-serge");
  assert.equal(serge.words, 5);
  assert.equal(serge.lines, 2, "deux répliques, jamais fusionnées pour le camembert");
});

test("speechStats trie du plus bavard au moins bavard, comme les parts", () => {
  const { rows } = speechStats(
    [line("c-annie", "un"), line("c-serge", "un deux trois quatre")],
    CHARACTERS
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["c-serge", "c-annie"]
  );
});

test("speechStats omet un personnage muet dans la portée", () => {
  // Sinon la légende d'une scène à deux personnages listerait la distribution
  // entière, avec des parts à zéro.
  const { rows } = speechStats([line("c-serge", "un")], CHARACTERS);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["c-serge"]
  );
});

test("une réplique sans personnage connu est comptée à part, jamais fondue", () => {
  // Même parti que la grille de l'Avancement : ces répliques gonflent le total
  // et n'appartiennent à personne, donc elles se voient.
  const { rows, totalWords } = speechStats(
    [line("c-serge", "un"), line(null, "deux trois"), line("c-fantome", "quatre")],
    CHARACTERS
  );
  const unknown = rows.find((r) => r.id === UNKNOWN);
  assert.ok(unknown, "les orphelines ont leur ligne");
  assert.equal(unknown.words, 3, "characterId nul ET id inconnu tombent dans le même seau");
  assert.equal(unknown.lines, 2);
  assert.equal(unknown.name, null, "pas de nom à afficher, l'appelant met le libellé");
  assert.equal(totalWords, 4, "le total les compte, il ne les cache pas");
});

test("speechStats compte une réplique vide comme une réplique de zéro mot", () => {
  const { rows, totalWords, totalLines } = speechStats([line("c-serge", "")], CHARACTERS);
  assert.equal(totalWords, 0);
  assert.equal(totalLines, 1, "elle existe dans la pièce");
  assert.equal(rows[0].words, 0);
});

test("speechStats encaisse une portée ou une distribution difforme", () => {
  for (const raw of [null, undefined, 42, [null, 42, {}]]) {
    assert.doesNotThrow(() => speechStats(raw, CHARACTERS), `lignes : ${JSON.stringify(raw)}`);
  }
  assert.doesNotThrow(() => speechStats([line("c-serge", "un")], null));
});

// -------------------------------------------------------------- centerFontSize

test("le centre de l'anneau garde sa taille nominale sur les textes d'aujourd'hui", () => {
  // La réduction ne doit RIEN changer à ce que la page dessine déjà : sinon un
  // réglage écrit pour un cas extrême rapetisserait tous les anneaux du site.
  assert.equal(centerFontSize("10307", TOTAL_SIZE), TOTAL_SIZE, "les 10 307 mots de la pièce");
  assert.equal(centerFontSize(10307, TOTAL_SIZE), TOTAL_SIZE, "un nombre, pas une chaîne");
  assert.equal(centerFontSize("répliques", UNIT_SIZE), UNIT_SIZE, "l'unité la plus longue");
  assert.equal(centerFontSize("mots", UNIT_SIZE), UNIT_SIZE);
  for (const raw of ["", null, undefined]) {
    assert.equal(centerFontSize(raw, TOTAL_SIZE), TOTAL_SIZE, `rien à faire tenir : ${raw}`);
  }
});

test("le séparateur de milliers ne compte pas pour un chiffre", () => {
  // Depuis que le total passe par `fmt.number`, la ligne du centre porte une
  // insécable étroite en français et une virgule en anglais. Comptés pleine
  // chasse, ces caractères faisaient tomber le total de la pièce publiée de 17 à
  // 14,5 unités, soit un rétrécissement de 15 % pour une ligne qui ne s'élargit
  // que de 6 % : c'est ce garde qui tient l'écart, et sans lui la page phare du
  // site rapetissait son plus gros chiffre en gagnant sa typographie.
  const nu = centerFontSize("10307", TOTAL_SIZE);
  for (const separateur of ["\u202f", "\u00a0", " ", ","]) {
    const groupe = centerFontSize(`10${separateur}307`, TOTAL_SIZE);
    assert.ok(groupe < nu, `« 10${separateur}307 » est plus large que « 10307 »`);
    assert.ok(
      groupe > nu * 0.95,
      `un séparateur ne doit pas coûter un chiffre entier (${separateur.codePointAt(0)})`
    );
  }
  // Et il reste plus étroit qu'un chiffre : six chiffres pleins descendent bien
  // plus bas que cinq chiffres et un séparateur.
  assert.ok(centerFontSize("103070", TOTAL_SIZE) < centerFontSize("10\u202f307", TOTAL_SIZE));
});

test("le centre de l'anneau rétrécit un texte trop long et plafonne sa largeur", () => {
  // Ce que le calcul promet : la ligne ne déborde jamais du trou de l'anneau,
  // donc sa largeur rendue (nombre de caractères x taille) ne grandit plus une
  // fois le plafond atteint, quelle que soit la longueur. C'est cette invariance
  // qu'on vérifie, plutôt que de recopier ici les constantes du module, ce qui ne
  // ferait que déplacer le problème.
  const width = (text, nominal) => String(text).length * centerFontSize(text, nominal);
  assert.ok(centerFontSize("1234567", TOTAL_SIZE) < TOTAL_SIZE, "sept chiffres ne tiennent pas");
  assert.ok(
    Math.abs(width("1234567", TOTAL_SIZE) - width("123456789012", TOTAL_SIZE)) < 1e-9,
    "la largeur est la même dès qu'on rétrécit"
  );
  // Et jamais PLUS grand que le nominal : un total d'un seul chiffre ne se
  // dessine pas en gros titre au milieu de l'anneau.
  assert.equal(centerFontSize("7", TOTAL_SIZE), TOTAL_SIZE);
});

// --------------------------------------------------------------- clampColumns

test("le réglage par défaut est celui de la référence", () => {
  // `generate_viz.py` dessinait la pièce entière à `w=100` et chaque scène à
  // `w=50` : la page sert le même document que le PDF de la troupe, donc son bloc
  // se lit à la largeur où elle l'a toujours lu. Ces deux valeurs sont exactement
  // le défaut et la borne basse, la course ne fait que les prolonger.
  assert.equal(DEFAULT_COLUMNS, 100);
  assert.equal(MIN_COLUMNS, 50);
  assert.ok(DEFAULT_COLUMNS >= MIN_COLUMNS && DEFAULT_COLUMNS <= MAX_COLUMNS);
  // Les trois chiffres tombent sur la grille du pas : une valeur hors grille
  // ferait sauter le premier appui sur une flèche du clavier.
  for (const value of [MIN_COLUMNS, DEFAULT_COLUMNS, MAX_COLUMNS]) {
    assert.equal((value - MIN_COLUMNS) % COLUMNS_STEP, 0, `${value} hors grille`);
  }
});

test("clampColumns tient le réglage dans ses bornes", () => {
  assert.equal(clampColumns(60), 60);
  assert.equal(clampColumns(MIN_COLUMNS - 1), MIN_COLUMNS);
  assert.equal(clampColumns(MAX_COLUMNS + 1000), MAX_COLUMNS);
  assert.equal(clampColumns("96"), 96, "la valeur d'un input arrive en chaîne");
  assert.equal(clampColumns(96.4), 96, "un entier, c'est un nombre de mots");
});

test("clampColumns retombe sur le défaut plutôt que sur un bloc absurde", () => {
  // C'est lui qui alimente le viewBox : une valeur illisible y ferait un dessin
  // illisible, c'est-à-dire une panne qu'on ne voit pas.
  for (const raw of [NaN, Infinity, -Infinity, undefined, "abc"]) {
    assert.equal(clampColumns(raw), DEFAULT_COLUMNS, `entrée : ${raw}`);
  }
});

// ----------------------------------------------------------------- blockRects

test("la somme des largeurs redonne le total de mots", () => {
  // LE contrat du bloc : chaque mot occupe exactement un carré, une fois.
  const lines = [
    line("c-serge", "un deux trois quatre cinq six sept"),
    line("c-annie", "huit neuf dix onze"),
    line("c-serge", "douze"),
  ];
  const { rects, words } = blockRects(lines, 5, CHARACTERS);
  assert.equal(words, 12);
  assert.equal(
    rects.reduce((sum, r) => sum + r.width, 0),
    12
  );
});

test("un tronçon à cheval sur trois rangées donne trois rectangles", () => {
  const { rects, rows } = blockRects([line("c-serge", "a b c d e f g h i j k l")], 5, CHARACTERS);
  assert.equal(rows, 3);
  assert.deepEqual(
    rects.map((r) => [r.x, r.y, r.width]),
    [
      [0, 0, 5],
      [0, 1, 5],
      [0, 2, 2],
    ]
  );
});

test("aucun rectangle ne dépasse la largeur du bloc", () => {
  const lines = [line("c-serge", "a b c d e f g"), line("c-annie", "h i"), line("c-serge", "j k l m")];
  for (const columns of [1, 3, 7, 24]) {
    for (const r of blockRects(lines, columns, CHARACTERS).rects) {
      assert.ok(r.x >= 0 && r.x + r.width <= columns, `colonnes ${columns} : ${JSON.stringify(r)}`);
      assert.ok(r.width > 0, "un rectangle vide ne se dessine pas");
    }
  }
});

test("les répliques consécutives d'un même personnage fusionnent en un tronçon", () => {
  // Elles seraient adjacentes et de la même couleur : deux rectangles au lieu
  // d'un, pour rien. C'est ce qui tient le compte de rectangles en centaines
  // plutôt qu'en milliers sur la pièce entière.
  const { rects } = blockRects([line("c-serge", "un deux"), line("c-serge", "trois")], 100, CHARACTERS);
  assert.equal(rects.length, 1);
  assert.equal(rects[0].width, 3);
});

test("une réplique sans mot n'occupe aucun carré et ne coupe pas un tronçon", () => {
  const { rects, words } = blockRects(
    [line("c-serge", "un deux"), line("c-annie", "   "), line("c-serge", "trois")],
    100,
    CHARACTERS
  );
  assert.equal(words, 2 + 1);
  assert.equal(rects.length, 1, "la réplique vide n'interrompt pas la fusion");
});

test("blockRects garde le personnage de chaque tronçon, y compris inconnu", () => {
  const { rects } = blockRects([line("c-serge", "un"), line(null, "deux")], 100, CHARACTERS);
  assert.deepEqual(
    rects.map((r) => r.characterId),
    ["c-serge", UNKNOWN]
  );
});

test("le bloc et les décomptes mettent les orphelines dans le MÊME seau", () => {
  // C'est ce qui rend « Personnage inconnu » isolable dans la légende du bloc :
  // elle envoie le `row.id` des décomptes, et le bloc compare avec le
  // `characterId` de ses tronçons. Quand le bloc gardait l'id brut, un
  // `characterId` nul comme un personnage supprimé ne valait jamais ce seau,
  // donc isoler la ligne « Personnage inconnu » éteignait le bloc entier.
  const lines = [
    line("c-serge", "un"),
    line(null, "deux"),
    line("c-fantome", "trois"), // un personnage supprimé du script à la main
  ];
  const { rows } = speechStats(lines, CHARACTERS);
  const { rects } = blockRects(lines, 100, CHARACTERS);
  const isolated = rows.find((r) => r.id === UNKNOWN).id;
  assert.ok(
    rects.some((r) => r.characterId === isolated),
    "au moins un tronçon s'allume quand on isole les orphelines"
  );
  assert.deepEqual(
    rects.map((r) => r.characterId),
    ["c-serge", UNKNOWN],
    "les deux orphelines voisines fusionnent : même seau, même couleur"
  );
});

test("blockRects encaisse une portée vide ou difforme sans rendre zéro rangée", () => {
  // `rows` vaut au moins 1 : un viewBox de hauteur 0 ne se dessine pas et
  // l'élément SVG s'effondre.
  for (const raw of [[], null, undefined, 42, [null, {}]]) {
    const block = blockRects(raw, 10, CHARACTERS);
    assert.deepEqual(block.rects, [], `entrée : ${JSON.stringify(raw)}`);
    assert.equal(block.rows, 1);
    assert.equal(block.words, 0);
  }
});

test("blockRects se défend d'une largeur absurde", () => {
  for (const columns of [0, -3, NaN, null, undefined, 0.4]) {
    const block = blockRects([line("c-serge", "un deux")], columns, CHARACTERS);
    assert.ok(block.columns >= 1, `colonnes : ${columns}`);
    assert.equal(
      block.rects.reduce((sum, r) => sum + r.width, 0),
      2
    );
  }
});
