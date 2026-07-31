// L'identité d'une pièce : l'identifiant qui nomme son dossier et son adresse.
//
// C'est le seul endroit du site qui FABRIQUE un identifiant de pièce, et il le fait
// une fois pour toutes : un identifiant erroné ne se rattrape pas d'une correction,
// il faudrait renommer un dossier du dépôt et rendre caducs les liens déjà donnés à
// la troupe.
import test from "node:test";
import assert from "node:assert/strict";

import { MAX_PLAY_ID_LENGTH, isPlayId, mintPlayId, newPlayScript } from "./plays.js";
import { EMPTY_SCRIPT } from "../editor/reducer.js";

test("un identifiant est minté depuis le titre, lisible dans une barre d'adresse", () => {
  assert.equal(mintPlayId("Transport de Femmes"), "transport-de-femmes");
  assert.equal(mintPlayId("Le Malade imaginaire"), "le-malade-imaginaire");
  assert.equal(mintPlayId("  Antigone  "), "antigone");
  // Accents et apostrophes passent par le pliage de `slugify`.
  assert.equal(mintPlayId("L'École des femmes"), "l-ecole-des-femmes");
});

test("tout ce que mintPlayId rend est accepté par le garde du projet", () => {
  // Le vrai contrat : ce que le site fabrique, l'Action doit l'accepter. Sinon la
  // pièce se crée et tous ses dépôts sont refusés ensuite.
  for (const title of [
    "Transport de Femmes",
    "L'École des femmes",
    "Ubu roi !",
    "1789",
    "Bérénice",
    "a",
    "x".repeat(200),
    "Fin de partie ---",
  ]) {
    const id = mintPlayId(title);
    assert.ok(isPlayId(id), `« ${title} » a donné « ${id} »`);
  }
});

test("un titre trop long est tronqué sans laisser de tiret en bout", () => {
  // La troncature peut tomber pile sur un tiret, que le motif refuse en fin de
  // chaîne autant qu'en tête.
  const id = mintPlayId("un titre interminable ".repeat(10));
  assert.equal(id.length <= MAX_PLAY_ID_LENGTH, true);
  assert.ok(!id.endsWith("-"), id);
  assert.ok(isPlayId(id));
});

test("un titre qui ne laisse rien rend une chaîne vide, jamais un nom inventé", () => {
  // L'appelant demande alors un autre titre : un dossier nommé « piece-1 » ne
  // dirait rien à personne, et il vivrait des années dans l'URL de la troupe.
  for (const title of ["", "   ", "???", "!!!", "---", null, undefined, 42]) {
    assert.equal(mintPlayId(title), "");
  }
});

test("la pièce créée a exactement les champs d'une pièce de l'éditeur", () => {
  // Miroir d'EMPTY_SCRIPT : un champ ajouté à la pièce doit arriver dans les deux,
  // sinon une pièce neuve naîtrait sans lui et l'éditeur le comblerait en silence.
  const fresh = newPlayScript("antigone", "Antigone", "fr");
  assert.deepEqual(Object.keys(fresh).sort(), Object.keys(EMPTY_SCRIPT).sort());
});

test("la pièce créée porte son identifiant, son titre et sa langue", () => {
  const fresh = newPlayScript("antigone", "Antigone", "en");
  assert.equal(fresh.id, "antigone");
  assert.equal(fresh.title, "Antigone");
  assert.equal(fresh.language, "en");
});

test("la pièce créée porte une scène où écrire, comme le plancher de l'éditeur", () => {
  // Sans elle, la première ouverture de l'Édition n'aurait aucune scène à afficher
  // (le Python, lui, n'invente jamais un acte que le fichier ne porte pas).
  const fresh = newPlayScript("antigone", "Antigone", "fr");
  assert.deepEqual(fresh.acts, [{ scenes: [{ lines: [] }] }]);
  assert.deepEqual(fresh.characters, []);
});
