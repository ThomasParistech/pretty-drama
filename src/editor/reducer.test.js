// Tests du cœur de l'éditeur : la réparation d'un script.json douteux
// (sanitizeScript) et les cas du reducer qui portent un invariant du projet.
//
// C'est de la logique pure, sans React ni DOM : `node --test` la joue telle
// quelle. Ce qui se teste ici est exactement ce qui ne se relit pas à l'œil :
// un id de réplique recyclé, une réplique qui change de personnage en
// silence, une action refusée qui pousserait quand même une étape d'annulation.
import test from "node:test";
import assert from "node:assert/strict";

import { CHARACTER_COLORS, assignColors, isPaletteColor } from "../shared/characterColors.js";
import {
  EMPTY_SCRIPT,
  SAFE_ID,
  allLines,
  indexAfterMove,
  indexAfterRemoval,
  sanitizeScript,
  scriptReducer,
} from "./reducer.js";

const play = (overrides = {}) => ({
  title: "Le Misanthrope",
  characters: [
    { id: "c-alceste", name: "Alceste", color: CHARACTER_COLORS[0] },
    { id: "c-philinte", name: "Philinte", color: CHARACTER_COLORS[1] },
  ],
  acts: [
    {
      title: "Acte I",
      scenes: [
        {
          title: "Scène 1",
          lines: [
            { id: "l-1", characterId: "c-alceste", text: "Laissez-moi." },
            { id: "l-2", characterId: "c-philinte", text: "Qu'est-ce donc ?" },
          ],
        },
      ],
    },
  ],
  ...overrides,
});

// Une pièce à DEUX actes : SET_LINE_TEXTS est le seul cas « lignes » qui n'est
// pas borné à une scène, donc le seul qui ne se vérifie pas sur un acte unique.
const twoActs = () =>
  play({
    acts: [
      play().acts[0],
      {
        title: "Acte II",
        scenes: [
          {
            title: "Scène 1",
            lines: [{ id: "l-3", characterId: "c-philinte", text: "Encore vous ?" }],
          },
        ],
      },
    ],
  });

const firstScene = (script) => script.acts[0].scenes[0];
const lineIds = (script) => allLines(script).map((l) => l.id);
const ownerOf = (script, lineId) => {
  const line = allLines(script).find((l) => l.id === lineId);
  return script.characters.find((c) => c.id === line.characterId)?.name ?? null;
};

// ---------------------------------------------------------------- sanitize

test("sanitizeScript rend un script valide inchangé dans sa substance", () => {
  const sane = sanitizeScript(play());
  assert.equal(sane.title, "Le Misanthrope");
  assert.deepEqual(lineIds(sane), ["l-1", "l-2"]);
  assert.deepEqual(
    sane.characters.map((c) => c.id),
    ["c-alceste", "c-philinte"]
  );
});

test("sanitizeScript accepte n'importe quelle racine sans jeter", () => {
  for (const raw of [null, undefined, 42, "texte", [1, 2, 3], {}]) {
    const sane = sanitizeScript(raw);
    assert.equal(typeof sane.title, "string");
    assert.deepEqual(sane.characters, []);
    // Toujours au moins un acte et une scène : l'éditeur a besoin d'un endroit
    // où écrire la première réplique.
    assert.ok(sane.acts.length >= 1);
    assert.ok(sane.acts[0].scenes.length >= 1);
  }
});

test("tout id de réplique rendu respecte SAFE_ID, donc nomme un mp3 sans danger", () => {
  const sane = sanitizeScript(
    play({
      acts: [
        {
          scenes: [
            {
              lines: [
                { id: "../evil", characterId: "c-alceste", text: "a" },
                { id: "avec espace", characterId: "c-alceste", text: "b" },
                { id: "abc\n", characterId: "c-alceste", text: "c" },
                { id: "x".repeat(65), characterId: "c-alceste", text: "d" },
                { id: 7, characterId: "c-alceste", text: "e" },
                { id: "l-legitime", characterId: "c-alceste", text: "f" },
              ],
            },
          ],
        },
      ],
    })
  );
  const ids = lineIds(sane);
  assert.equal(ids.length, 6);
  for (const id of ids) assert.match(id, SAFE_ID);
  // Un id lisible et valide n'est jamais remplacé : il nomme peut-être déjà
  // un clip publié.
  assert.ok(ids.includes("l-legitime"));
});

test("un id de réplique dupliqué est reminté, jamais recyclé", () => {
  const sane = sanitizeScript(
    play({
      acts: [
        {
          scenes: [
            {
              lines: [
                { id: "l-1", characterId: "c-alceste", text: "premier" },
                { id: "l-1", characterId: "c-philinte", text: "second" },
              ],
            },
          ],
        },
      ],
    })
  );
  const [a, b] = firstScene(sane).lines;
  assert.equal(a.id, "l-1", "le premier porteur garde son id (son clip existe peut-être)");
  assert.notEqual(b.id, "l-1");
  assert.match(b.id, SAFE_ID);
  assert.equal(new Set(lineIds(sane)).size, 2);
});

test("un personnage à l'id hors SAFE_ID est reminté ET ses répliques le suivent", () => {
  // Sans quoi une simple lettre accentuée dans un script.json édité à la main
  // orphelinerait tout un rôle : plus personne pour l'enregistrer.
  const sane = sanitizeScript({
    characters: [{ id: "éliante", name: "Éliante" }],
    acts: [{ scenes: [{ lines: [{ id: "l-1", characterId: "éliante", text: "Bonjour." }] }] }],
  });
  assert.equal(ownerOf(sane, "l-1"), "Éliante");
  assert.match(sane.characters[0].id, SAFE_ID);
});

test("deux personnages au MÊME id : le premier garde l'id et ses répliques", () => {
  // Le second repart avec un id neuf et aucune réplique. Déplacer les
  // répliques vers lui changerait qui parle dans la pièce, alors que les mp3
  // (nommés par id de réplique) ne bougeraient pas : la voix enregistrée par
  // l'un se mettrait à sortir sous le nom de l'autre.
  const sane = sanitizeScript({
    characters: [{ id: "c1", name: "Alceste" }, { id: "c1", name: "Philinte" }],
    acts: [{ scenes: [{ lines: [{ id: "l-1", characterId: "c1", text: "Laissez-moi." }] }] }],
  });
  assert.equal(sane.characters[0].id, "c1");
  assert.notEqual(sane.characters[1].id, "c1");
  assert.equal(ownerOf(sane, "l-1"), "Alceste");
});

test("une réplique qui cite un personnage inexistant devient orpheline, pas une erreur", () => {
  const sane = sanitizeScript(
    play({
      acts: [{ scenes: [{ lines: [{ id: "l-1", characterId: "c-fantome", text: "?" }] }] }],
    })
  );
  assert.equal(firstScene(sane).lines[0].characterId, null);
});

test("les entrées malformées sont abandonnées, jamais un crash", () => {
  const sane = sanitizeScript({
    characters: [
      { id: "c-ok", name: "Alceste" },
      { id: "c-vide", name: "   " }, // nom blanc : pas un personnage
      { id: "c-sans-nom" },
      null,
      "Philinte",
    ],
    acts: [
      null,
      { scenes: [null, { lines: [null, 42, { id: "l-1", text: "seule valide" }] }] },
    ],
  });
  assert.deepEqual(
    sane.characters.map((c) => c.name),
    ["Alceste"]
  );
  assert.deepEqual(lineIds(sane), ["l-1"]);
  assert.equal(allLines(sane)[0].text, "seule valide");
});

test("une couleur absente ou étrangère est réparée avec une couleur de la palette", () => {
  const sane = sanitizeScript({
    characters: [
      { id: "c1", name: "A" },
      { id: "c2", name: "B", color: 999 },
      { id: "c3", name: "C", color: "bleu" },
      // Un doublon repart aussi avec une couleur neuve : deux personnages de la
      // même couleur seraient indiscernables dans les camemberts de la
      // Répartition.
      { id: "c4", name: "D", color: CHARACTER_COLORS[0] },
    ],
    acts: [],
  });
  for (const c of sane.characters) assert.ok(isPaletteColor(c.color), `couleur : ${c.color}`);
  // Déterministe et sans doublon tant que la palette n'est pas épuisée.
  assert.equal(new Set(sane.characters.map((c) => c.color)).size, 4);
});

test("l'Édition et la Répartition comblent les couleurs à l'identique", () => {
  // LE contrat de l'extraction dans src/shared/characterColors.js : le script
  // publié n'a AUCUNE couleur (le fichier de la troupe est antérieur), donc les
  // deux pages les comblent chacune de son côté, l'éditeur par `sanitizeScript`
  // et la Répartition par `assignColors` sur le manifest. Deux comblements qui
  // dérivent montreraient deux distributions différentes de la même pièce.
  const characters = [
    { id: "c-alceste", name: "Alceste" },
    { id: "c-philinte", name: "Philinte" },
    { id: "c-oronte", name: "Oronte" },
    // Une couleur déjà posée doit être respectée des deux côtés, y compris
    // quand elle n'est pas celle que le comblement aurait donnée.
    { id: "c-celimene", name: "Célimène", color: CHARACTER_COLORS[7] },
  ];
  const edition = sanitizeScript({ characters, acts: [] }).characters;
  const repartition = assignColors(characters);
  assert.deepEqual(
    edition.map((c) => [c.id, c.color]),
    [...repartition],
    "même id, même couleur, dans le même ordre"
  );

  // Et une fois la palette épuisée, là où les deux comptent les personnages
  // servis chacun à sa façon (un compteur ici, la taille de la Map là) : c'est
  // le seul endroit où ce décompte décide de la couleur, donc le seul où les
  // deux peuvent se décaler sans que rien ne le dise.
  const troupe = Array.from({ length: 23 }, (_, i) => ({ id: `c${i}`, name: `Personnage ${i}` }));
  assert.deepEqual(
    sanitizeScript({ characters: troupe, acts: [] }).characters.map((c) => c.color),
    [...assignColors(troupe).values()],
    "la palette boucle du même pas des deux côtés"
  );
});

test("un texte absent devient une chaîne vide, jamais undefined", () => {
  const sane = sanitizeScript({
    characters: [],
    acts: [{ scenes: [{ lines: [{ id: "l-1" }, { id: "l-2", text: 42 }] }] }],
  });
  for (const line of allLines(sane)) assert.equal(line.text, "");
});

// ----------------------------------------------------------------- reducer

test("déplacer une réplique lui garde son id (son mp3 reste le sien)", () => {
  const before = play();
  const after = scriptReducer(before, {
    type: "MOVE_LINE",
    actIndex: 0,
    sceneIndex: 0,
    activeId: "l-1",
    overId: "l-2",
  });
  assert.deepEqual(lineIds(after), ["l-2", "l-1"]);
});

test("renommer un personnage ne touche aucun id de réplique", () => {
  const before = play();
  const after = scriptReducer(before, {
    type: "RENAME_CHARACTER",
    id: "c-alceste",
    name: "ALCESTE",
  });
  assert.deepEqual(lineIds(after), lineIds(before));
  assert.equal(ownerOf(after, "l-1"), "ALCESTE");
});

test("éditer un texte ne touche pas l'id de la réplique", () => {
  const after = scriptReducer(play(), {
    type: "EDIT_TEXT",
    actIndex: 0,
    sceneIndex: 0,
    lineId: "l-1",
    text: "Tout autre chose.",
  });
  assert.deepEqual(lineIds(after), ["l-1", "l-2"]);
  assert.equal(allLines(after)[0].text, "Tout autre chose.");
});

test("une nouvelle réplique reprend le personnage de celle qu'elle suit", () => {
  const after = scriptReducer(play(), {
    type: "ADD_LINE",
    id: "l-3",
    actIndex: 0,
    sceneIndex: 0,
    afterLineId: "l-1",
  });
  assert.deepEqual(lineIds(after), ["l-1", "l-3", "l-2"]);
  assert.equal(ownerOf(after, "l-3"), "Alceste");
});

test("supprimer un personnage : réassigner déplace ses répliques, sans changer leurs ids", () => {
  const after = scriptReducer(play(), {
    type: "DELETE_CHARACTER",
    id: "c-alceste",
    mode: "reassign",
    reassignTo: "c-philinte",
  });
  assert.deepEqual(lineIds(after), ["l-1", "l-2"]);
  assert.equal(ownerOf(after, "l-1"), "Philinte");
  assert.equal(after.characters.length, 1);
});

test("supprimer un personnage : l'autre mode emporte ses répliques", () => {
  const after = scriptReducer(play(), {
    type: "DELETE_CHARACTER",
    id: "c-alceste",
    mode: "deleteLines",
  });
  assert.deepEqual(lineIds(after), ["l-2"]);
});

test("une action refusée rend l'état PRÉCIS reçu, pas une copie", () => {
  // history.js compare par identité pour savoir s'il faut empiler une étape
  // d'annulation : une copie ferait naître des étapes vides, et « Modifications
  // non téléchargées » s'allumerait sans qu'on ait rien modifié.
  const before = play();
  const edit = (edits) => ({ type: "SET_LINE_TEXTS", edits });
  const retype = (lineId, text) => ({ type: "EDIT_TEXT", actIndex: 0, sceneIndex: 0, lineId, text });
  for (const [i, action] of [
    { type: "ADD_CHARACTER", id: "c-neuf", name: "   " },
    { type: "RENAME_CHARACTER", id: "c-alceste", name: "  " },
    { type: "ACTION_INCONNUE" },
    { type: "MOVE_LINE", actIndex: 0, sceneIndex: 0, activeId: "l-1", overId: "l-1" },
    // Un remplacement sans effet : lot vide, réplique inconnue, texte déjà en
    // place, lot malformé.
    edit([]),
    edit([{ lineId: "l-inconnue", text: "Ailleurs." }]),
    edit([{ lineId: "l-1", text: "Laissez-moi." }]),
    edit("pas un tableau"),
    edit([null, { lineId: "l-1" }, { text: "sans id" }]),
    // Et une frappe qui repose le texte courant.
    retype("l-1", "Laissez-moi."),
    retype("l-inconnue", "Ailleurs."),
  ].entries()) {
    assert.equal(scriptReducer(before, action), before, `action ${i} : ${action.type}`);
  }
});

test("SET_LINE_TEXTS réécrit plusieurs répliques de plusieurs actes en un seul état", () => {
  const before = twoActs();
  const after = scriptReducer(before, {
    type: "SET_LINE_TEXTS",
    edits: [
      { lineId: "l-1", text: "Laissez-nous." },
      { lineId: "l-3", text: "Encore nous ?" },
    ],
  });
  // Les ids ne bougent pas : ils nomment les mp3 déjà enregistrés.
  assert.deepEqual(lineIds(after), ["l-1", "l-2", "l-3"]);
  assert.deepEqual(
    allLines(after).map((l) => l.text),
    ["Laissez-nous.", "Qu'est-ce donc ?", "Encore nous ?"]
  );
});

test("SET_LINE_TEXTS garde l'identité de ce qu'il ne touche pas", () => {
  // C'est ce qui laisse React.memo sauter le reste de la pièce : un
  // remplacement dans l'acte II ne doit pas faire re-rendre l'acte I.
  const before = twoActs();
  const after = scriptReducer(before, {
    type: "SET_LINE_TEXTS",
    edits: [{ lineId: "l-3", text: "Encore nous ?" }],
  });
  assert.notEqual(after, before);
  assert.equal(after.acts[0], before.acts[0], "l'acte intact garde son objet");
  assert.equal(
    firstScene(after).lines[1],
    firstScene(before).lines[1],
    "la réplique intacte garde son objet"
  );
});

test("un nouveau personnage reçoit une couleur libre de la palette", () => {
  const after = scriptReducer(play(), { type: "ADD_CHARACTER", id: "c-oronte", name: "Oronte" });
  const oronte = after.characters.find((c) => c.id === "c-oronte");
  assert.ok(isPaletteColor(oronte.color));
  assert.equal(new Set(after.characters.map((c) => c.color)).size, 3);
});

test("SET_CHARACTER_COLOR refuse une couleur hors palette, sans fabriquer d'état", () => {
  // Une action refusée ne doit rien empiler dans l'historique : le reducer rend
  // l'état REÇU, pas une copie (cf. l'invariant du no-op).
  const before = play();
  const same = scriptReducer(before, {
    type: "SET_CHARACTER_COLOR",
    id: "c-alceste",
    color: "chartreuse",
  });
  assert.equal(same, before, "état rendu à l'identique");
  const after = scriptReducer(before, {
    type: "SET_CHARACTER_COLOR",
    id: "c-alceste",
    color: CHARACTER_COLORS[5],
  });
  assert.equal(after.characters[0].color, CHARACTER_COLORS[5]);
});

// ---- Remaniement du plan (section « Structure » du rail) ----

test("MOVE_ACT réordonne les actes et les répliques suivent leur scène", () => {
  const before = twoActs();
  const after = scriptReducer(before, { type: "MOVE_ACT", from: 1, to: 0 });
  assert.deepEqual(
    after.acts.map((a) => a.title),
    ["Acte II", "Acte I"]
  );
  // Les ids nomment les mp3 : réordonner ne doit jamais en reminter un.
  assert.deepEqual(lineIds(after).sort(), lineIds(before).sort());
  assert.equal(after.acts[0], before.acts[1], "l'acte déplacé garde son objet");
});

test("MOVE_SCENE réordonne dans son acte et laisse les autres intacts", () => {
  const before = scriptReducer(twoActs(), { type: "ADD_SCENE", actIndex: 0 });
  const after = scriptReducer(before, { type: "MOVE_SCENE", actIndex: 0, from: 1, to: 0 });
  assert.deepEqual(
    after.acts[0].scenes.map((s) => s.title),
    ["Scène 2", "Scène 1"]
  );
  assert.equal(after.acts[1], before.acts[1], "l'acte non touché garde son objet");
});

test("un déplacement sans effet rend l'état PRÉCIS reçu", () => {
  // Sinon history.js y verrait une modification : reposer une scène là où elle
  // était allumerait « Modifications non téléchargées » et laisserait une étape
  // vide à annuler (même contrat que MOVE_LINE et EDIT_TEXT).
  const before = twoActs();
  for (const action of [
    { type: "MOVE_ACT", from: 1, to: 1 },
    { type: "MOVE_ACT", from: 0, to: 7 },
    { type: "MOVE_ACT", from: -1, to: 0 },
    { type: "MOVE_SCENE", actIndex: 0, from: 0, to: 0 },
    { type: "MOVE_SCENE", actIndex: 0, from: 0, to: 3 },
    { type: "MOVE_SCENE", actIndex: 9, from: 0, to: 0 },
  ]) {
    assert.equal(scriptReducer(before, action), before, JSON.stringify(action));
  }
});

test("indexAfterMove fait suivre la scène affichée", () => {
  // Ce qu'on regarde est ce qui bouge : il suit.
  assert.equal(indexAfterMove(2, 2, 0), 0);
  // Un voisin traverse ce qu'on regarde : on se décale d'un cran, dans le sens
  // inverse de sa traversée.
  assert.equal(indexAfterMove(0, 2, 0), 1);
  assert.equal(indexAfterMove(1, 0, 2), 0);
  // Une traversée qui ne passe pas par nous ne change rien.
  assert.equal(indexAfterMove(0, 1, 2), 0);
  assert.equal(indexAfterMove(3, 0, 1), 3);
});

test("indexAfterRemoval recule sur ce qui précède quand la scène regardée part", () => {
  assert.equal(indexAfterRemoval(2, 2), 1);
  // Le premier supprimé : il n'y a rien avant, on reste au rang 0 (qui est
  // maintenant celui du suivant).
  assert.equal(indexAfterRemoval(0, 0), 0);
  // Suppression avant nous : notre rang recule d'un cran. Après nous : rien.
  assert.equal(indexAfterRemoval(2, 0), 1);
  assert.equal(indexAfterRemoval(1, 3), 1);
});

test("EMPTY_SCRIPT est un script que sanitizeScript accepte tel quel", () => {
  assert.deepEqual(sanitizeScript(EMPTY_SCRIPT), {
    ...EMPTY_SCRIPT,
    characters: [],
  });
});
