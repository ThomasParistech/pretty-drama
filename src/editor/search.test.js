// Tests de la recherche et du remplacement de l'éditeur (search.js).
//
// C'est de la logique pure, sans React ni DOM : `node --test` la joue telle
// quelle. Et c'est le fichier le plus utile du lot, parce que tout ce qui est
// dur dans cette fonctionnalité est invisible à l'œil : un offset qui glisse
// d'un cran quand le mot porte un accent, une occurrence perdue à côté d'une
// occurrence refusée, un remplacement qui contient la requête et double le
// texte, un compte affiché qui ne correspond pas à ce qui sera réécrit.
//
// L'invariant dont tout le reste dépend est le premier test : le repliement
// conserve la longueur, donc un indice dans le texte replié est un indice dans
// le texte brut. Il est vérifié sur une TABLE et pas sur un exemple.
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXCERPT_AFTER,
  EXCERPT_BEFORE,
  buildReplaceEdits,
  foldText,
  matchExcerpt,
  replaceInText,
  replaceOneEdit,
  searchScript,
} from "./search.js";

// Deux actes, exprès : l'ordre de lecture et le groupement par scène ne se
// vérifient pas sur un acte unique. Les deux graphies de l'apostrophe cohabitent,
// comme dans la vraie pièce.
const play = () => ({
  title: "Le Misanthrope",
  characters: [
    { id: "c-alceste", name: "Alceste", color: "#1f77b4" },
    { id: "c-philinte", name: "Philinte", color: "#ff7f0e" },
  ],
  acts: [
    {
      title: "Acte I",
      scenes: [
        {
          title: "Scène 1",
          lines: [
            { id: "l-1", characterId: "c-alceste", text: "Cet élève m'écoute." },
            { id: "l-2", characterId: "c-philinte", text: "L’élève ? Quel élève ?" },
          ],
        },
        {
          title: "Scène 2",
          lines: [{ id: "l-3", characterId: "c-alceste", text: "Rien ici." }],
        },
      ],
    },
    {
      title: "Acte II",
      scenes: [
        {
          title: "Scène 1",
          lines: [
            { id: "l-4", characterId: "c-philinte", text: "Un dernier élève." },
            { id: "l-5", characterId: "c-alceste", text: "L'élève écoute." },
          ],
        },
      ],
    },
  ],
});

// Une pièce d'une seule réplique : les cas de frontière se lisent mieux sur le
// texte seul que noyés dans un extrait du Misanthrope.
const one = (text) => ({
  title: "Essai",
  characters: [],
  acts: [{ title: "Acte I", scenes: [{ title: "Scène 1", lines: [{ id: "l", characterId: null, text }] }] }],
});

const startsOf = (script, query, options) =>
  searchScript(script, query, options).matches.map((m) => m.start);
const countIn = (script, query, options) => searchScript(script, query, options).total;

// --------------------------------------------------------------- repliement

test("le repliement conserve la longueur, caractère par caractère", () => {
  // Chacune de ces chaînes casse une hypothèse naïve : minuscule qui rallonge
  // (İ), lettre sans décomposition canonique (Æ, ß, ﬁ), paire de substitution
  // (emoji), accent déjà séparé de sa lettre, apostrophe courbe.
  const table = [
    "École",
    "Æsop",
    "İstanbul",
    "straße",
    "ﬁn",
    "🎭 masque",
    "école",
    "l’amour",
    "MÈRE",
    "",
  ];
  for (const s of table) {
    for (const caseSensitive of [false, true]) {
      assert.equal(
        foldText(s, caseSensitive).length,
        s.length,
        `« ${s} », casse ${caseSensitive ? "respectée" : "ignorée"}`
      );
    }
  }
});

test("une recherche sans accent trouve le mot accentué, aux offsets du texte BRUT", () => {
  const { matches } = searchScript(one("Cet élève m'écoute."), "eleve");
  assert.equal(matches.length, 1);
  const m = matches[0];
  // Le vrai test n'est pas « il y a une occurrence » mais « ses offsets
  // découpent le bon morceau du texte d'origine ».
  assert.equal(m.text.slice(m.start, m.end), "élève");
});

test("une occurrence fait toujours la longueur de la requête", () => {
  const { matches } = searchScript(one("Cet élève."), "eleve");
  assert.equal(matches[0].end - matches[0].start, "eleve".length);
});

test("l'apostrophe droite et l'apostrophe courbe se trouvent l'une l'autre", () => {
  const courbe = searchScript(one("L’élève écoute."), "l'eleve").matches[0];
  assert.equal(courbe.text.slice(courbe.start, courbe.end), "L’élève");

  const droite = searchScript(one("L'élève écoute."), "l’eleve").matches[0];
  assert.equal(droite.text.slice(droite.start, droite.end), "L'élève");
});

test("un accent en point de code séparé ne donne pas de demi-occurrence", () => {
  // « école » écrit e + U+0301 : chercher « e » ne doit pas tomber sur le « e »
  // qui porte l'accent (le remplacer laisserait la marque orpheline). Le « e »
  // final du mot, lui, est une occurrence légitime.
  assert.deepEqual(startsOf(one("école"), "e"), [5]);
});

// ------------------------------------------------------------------ options

test("par défaut la casse et les accents sont ignorés", () => {
  assert.equal(countIn(play(), "ELEVE"), 5);
});

test("Respecter la casse ignore toujours les accents", () => {
  // Il n'y a pas de troisième case : « eleve » continue de trouver « élève »,
  // seule la casse devient exigeante.
  assert.equal(countIn(play(), "eleve", { caseSensitive: true }), 5);
  assert.equal(countIn(play(), "Eleve", { caseSensitive: true }), 0);
});

test("Mot entier s'arrête aux frontières de mot, pas aux apostrophes ni aux traits d'union", () => {
  const opts = { wholeWord: true };
  assert.equal(countIn(one("un mot et des mots"), "mot", opts), 1);
  // « vous » est un mot entier dans « mettez-vous », « homme » dans « l'homme ».
  assert.equal(countIn(one("mettez-vous là"), "vous", opts), 1);
  assert.equal(countIn(one("l'homme"), "homme", opts), 1);
});

test("Mot entier refuse une occurrence collée à un mot", () => {
  assert.deepEqual(startsOf(one("aaa aa"), "aa", { wholeWord: true }), [4]);
});

test("Mot entier ne perd pas une occurrence qui chevauche une occurrence refusée", () => {
  // Le piège du pas d'avancement. « a a » a deux occurrences qui se
  // chevauchent, aux indices 1 et 3 : la première est refusée (collée au
  // « x »), la seconde est un mot entier. Après un candidat REFUSÉ il faut donc
  // repartir d'UN cran ; repartir de la longueur de la requête sauterait par
  // dessus la bonne et la liste n'afficherait rien.
  assert.deepEqual(startsOf(one("xa a a"), "a a", { wholeWord: true }), [3]);
});

// ------------------------------------------------------------ forme du scan

test("une requête vide ne trouve rien et ne boucle pas", () => {
  const { matches, total, groups } = searchScript(play(), "");
  assert.deepEqual(matches, []);
  assert.equal(total, 0);
  assert.deepEqual(groups, []);
});

test("une requête d'un seul espace est bien cherchée", () => {
  // Elle n'est pas rognée : chercher une double espace est légitime.
  assert.deepEqual(startsOf(one("a b"), " "), [1]);
});

test("les occurrences ne se recouvrent jamais", () => {
  assert.deepEqual(startsOf(one("aaaa"), "aa"), [0, 2]);
});

test("les occurrences sortent dans l'ordre de lecture de la pièce", () => {
  const { matches, total, groups } = searchScript(play(), "eleve");
  assert.equal(total, 5);
  assert.deepEqual(
    matches.map((m) => m.index),
    [0, 1, 2, 3, 4]
  );
  const ordinals = matches.map((m) => m.lineOrdinal);
  assert.deepEqual(ordinals, [...ordinals].sort((a, b) => a - b));
  // Une réplique sans occurrence ne fait pas de groupe, et un groupe porte les
  // titres tels que le bandeau les affiche.
  assert.deepEqual(
    groups.map((g) => [g.actTitle, g.sceneTitle, g.matches.length]),
    [
      ["Acte I", "Scène 1", 3],
      ["Acte II", "Scène 1", 2],
    ]
  );
  // Les groupes partagent les OBJETS du tableau plat : le panneau et la
  // navigation ne peuvent pas se désaccorder sur l'occurrence courante.
  assert.equal(groups[0].matches[0], matches[0]);
});

test("une occurrence porte de quoi y aller et de quoi la citer", () => {
  const m = searchScript(play(), "dernier").matches[0];
  assert.equal(m.actIndex, 1);
  assert.equal(m.sceneIndex, 0);
  assert.equal(m.lineId, "l-4");
  assert.equal(m.characterId, "c-philinte");
  assert.equal(m.text, "Un dernier élève.");
  assert.equal(typeof m.start, "number");
  assert.equal(typeof m.end, "number");
});

// ---------------------------------------------------------------- extraits

test("l'extrait encadre l'occurrence, même au milieu d'une longue tirade", () => {
  const long = "x".repeat(600) + "élève" + "y".repeat(400);
  const m = searchScript(one(long), "eleve").matches[0];
  const { before, hit, after } = matchExcerpt(m);
  assert.equal(hit, "élève");
  assert.ok(before.startsWith("…"), "l'extrait dit qu'il coupe à gauche");
  assert.ok(after.endsWith("…"), "l'extrait dit qu'il coupe à droite");
  // Dissymétrique, et de peu de côté du début : la rangée fait deux lignes, et
  // l'occurrence doit en faire partie (cf. EXCERPT_BEFORE / EXCERPT_AFTER).
  assert.equal(before.length, EXCERPT_BEFORE + 1); // « … » plus le rayon
  assert.equal(after.length, EXCERPT_AFTER + 1);
  assert.ok(EXCERPT_BEFORE < EXCERPT_AFTER, "ce qui suit l'occurrence a plus de place");
});

test("l'extrait aplatit les retours à la ligne", () => {
  // Une réplique peut en contenir (Maj + Entrée) ; le texte brut n'est pas
  // touché pour autant, c'est l'affichage qui tient sur une ligne.
  const m = searchScript(one("Un\ndeux élève"), "eleve").matches[0];
  const { before } = matchExcerpt(m);
  assert.equal(before, "Un deux ");
});

// ------------------------------------------------------------ remplacement

test("un remplacement qui contient la requête ne s'emballe pas", () => {
  assert.equal(replaceInText("aaa", "a", {}, "aa"), "aaaaaa");
});

test("remplacer par rien supprime", () => {
  assert.equal(replaceInText("un mot de trop", "de trop", {}, ""), "un mot ");
});

test("un texte sans occurrence est rendu inchangé", () => {
  const texte = "Rien à voir ici.";
  assert.equal(replaceInText(texte, "élève", {}, "X"), texte);
  assert.equal(replaceInText(texte, "", {}, "X"), texte);
});

test("un remplacement insensible réécrit la typographie du texte trouvé", () => {
  // Voulu et documenté : remplacer « eleve » par « ELEVE » ne rend pas les
  // accents, et remplacer à travers une apostrophe courbe écrit ce qui est
  // demandé. Deviner à la place de l'utilisateur serait pire.
  assert.equal(replaceInText("L’élève", "eleve", {}, "ELEVE"), "L’ELEVE");
  assert.equal(replaceInText("L’élève", "l'eleve", {}, "L'élève"), "L'élève");
});

test("il y a autant de remplacements que d'occurrences comptées", () => {
  // L'invariant de l'itérateur unique : ce que le panneau annonce est
  // exactement ce que « Tout remplacer » réécrit.
  const script = play();
  const total = searchScript(script, "eleve").total;
  const edits = buildReplaceEdits(script, "eleve", {}, "X");
  const replaced = edits.reduce((n, e) => n + (e.text.match(/X/g)?.length ?? 0), 0);
  assert.equal(replaced, total);
});

test("buildReplaceEdits ne cite que les répliques réellement changées", () => {
  const edits = buildReplaceEdits(play(), "eleve", {}, "X");
  assert.deepEqual(
    edits.map((e) => e.lineId),
    ["l-1", "l-2", "l-4", "l-5"] // l-3 (« Rien ici. ») n'y est pas
  );
  assert.deepEqual(buildReplaceEdits(play(), "", {}, "X"), []);
  assert.deepEqual(buildReplaceEdits(play(), "introuvable", {}, "X"), []);
});

test("replaceOneEdit place l'ancre après ce qui vient d'être écrit", () => {
  const m = searchScript(one("Cet élève."), "eleve").matches[0];
  const edit = replaceOneEdit(m, "disciple");
  assert.equal(edit.lineId, "l");
  assert.equal(edit.text, "Cet disciple.");
  assert.equal(edit.nextStart, m.start + "disciple".length);
});
