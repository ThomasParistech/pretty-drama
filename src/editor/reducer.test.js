// Tests du cœur de l'éditeur : la réparation d'un script.json douteux
// (sanitizeScript) et les cas du reducer qui portent un invariant du projet.
//
// C'est de la logique pure, sans React ni DOM : `node --test` la joue telle
// quelle. Ce qui se teste ici est exactement ce qui ne se relit pas à l'œil :
// un id de réplique recyclé, une réplique qui change de personnage en
// silence, une action refusée qui pousserait quand même une étape d'annulation.
import test from "node:test";
import assert from "node:assert/strict";

import {
  CHARACTER_HUES,
  EMPTY_SCRIPT,
  SAFE_ID,
  allLines,
  sanitizeScript,
  scriptReducer,
} from "./reducer.js";

const play = (overrides = {}) => ({
  title: "Le Misanthrope",
  characters: [
    { id: "c-alceste", name: "Alceste", hue: CHARACTER_HUES[0] },
    { id: "c-philinte", name: "Philinte", hue: CHARACTER_HUES[1] },
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

test("une teinte absente ou étrangère est réparée avec une teinte de la palette", () => {
  const sane = sanitizeScript({
    characters: [
      { id: "c1", name: "A" },
      { id: "c2", name: "B", hue: 999 },
      { id: "c3", name: "C", hue: "bleu" },
    ],
    acts: [],
  });
  for (const c of sane.characters) assert.ok(CHARACTER_HUES.includes(c.hue));
  // Déterministe et sans doublon tant que la palette n'est pas épuisée.
  assert.equal(new Set(sane.characters.map((c) => c.hue)).size, 3);
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
  for (const action of [
    { type: "ADD_CHARACTER", id: "c-neuf", name: "   " },
    { type: "RENAME_CHARACTER", id: "c-alceste", name: "  " },
    { type: "ACTION_INCONNUE" },
    { type: "MOVE_LINE", actIndex: 0, sceneIndex: 0, activeId: "l-1", overId: "l-1" },
  ]) {
    assert.equal(scriptReducer(before, action), before, `action : ${action.type}`);
  }
});

test("un nouveau personnage reçoit une teinte libre de la palette", () => {
  const after = scriptReducer(play(), { type: "ADD_CHARACTER", id: "c-oronte", name: "Oronte" });
  const oronte = after.characters.find((c) => c.id === "c-oronte");
  assert.ok(CHARACTER_HUES.includes(oronte.hue));
  assert.equal(new Set(after.characters.map((c) => c.hue)).size, 3);
});

test("EMPTY_SCRIPT est un script que sanitizeScript accepte tel quel", () => {
  assert.deepEqual(sanitizeScript(EMPTY_SCRIPT), {
    ...EMPTY_SCRIPT,
    characters: [],
  });
});
