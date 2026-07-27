// Tests de la pile d'annulation de l'éditeur.
//
// Deux choses s'y jouent qui ne se voient pas à la relecture : la FUSION des
// frappes clavier (sans elle, un Ctrl+Z = une lettre) et l'étiquette
// « Modifications non téléchargées », qui n'est pas un drapeau mais une
// comparaison `present !== saved`. Les deux reposent sur l'identité des
// objets d'état, donc sur le fait qu'une action refusée n'empile rien.
import test from "node:test";
import assert from "node:assert/strict";

import { historyReducer, initHistory } from "./history.js";

const PLAY = {
  title: "Le Misanthrope",
  characters: [{ id: "c-alceste", name: "Alceste", hue: 255 }],
  acts: [
    {
      title: "Acte I",
      scenes: [
        {
          title: "Scène 1",
          lines: [{ id: "l-1", characterId: "c-alceste", text: "" }],
        },
      ],
    },
  ],
};

const type = (text) => ({
  type: "EDIT_TEXT",
  actIndex: 0,
  sceneIndex: 0,
  lineId: "l-1",
  text,
});

const textOf = (state) => state.present.acts[0].scenes[0].lines[0].text;
// L'étiquette « Modifications non téléchargées » de l'éditeur, telle qu'App.jsx
// la dérive.
const dirty = (state) => state.present !== state.saved;

const apply = (state, ...actions) => actions.reduce(historyReducer, state);

test("au départ : rien à annuler, rien à télécharger", () => {
  const state = initHistory(PLAY);
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 0);
  assert.equal(dirty(state), false);
});

test("une rafale de frappes sur la MÊME réplique ne fait qu'une étape", () => {
  const state = apply(initHistory(PLAY), type("L"), type("La"), type("Lai"), type("Laissez"));
  assert.equal(textOf(state), "Laissez");
  assert.equal(state.past.length, 1, "une seule étape pour toute la rafale");
  const undone = historyReducer(state, { type: "UNDO" });
  assert.equal(textOf(undone), "", "un seul Ctrl+Z ramène avant la rafale");
});

test("HISTORY_BREAK (champ quitté) ferme la rafale en cours", () => {
  const state = apply(
    initHistory(PLAY),
    type("La"),
    { type: "HISTORY_BREAK" },
    type("Laissez")
  );
  assert.equal(state.past.length, 2);
  assert.equal(textOf(historyReducer(state, { type: "UNDO" })), "La");
});

test("une action d'une autre nature ferme la rafale", () => {
  const state = apply(
    initHistory(PLAY),
    type("La"),
    { type: "SET_TITLE", title: "Autre titre" },
    type("Laissez")
  );
  assert.equal(state.past.length, 3);
});

test("les frappes sur DEUX répliques différentes ne fusionnent pas", () => {
  const withTwo = {
    ...PLAY,
    acts: [
      {
        ...PLAY.acts[0],
        scenes: [
          {
            ...PLAY.acts[0].scenes[0],
            lines: [
              { id: "l-1", characterId: "c-alceste", text: "" },
              { id: "l-2", characterId: "c-alceste", text: "" },
            ],
          },
        ],
      },
    ],
  };
  const other = { type: "EDIT_TEXT", actIndex: 0, sceneIndex: 0, lineId: "l-2", text: "Q" };
  const state = apply(initHistory(withTwo), type("L"), other, type("La"));
  assert.equal(state.past.length, 3);
});

test("annuler puis rétablir revient exactement au même état", () => {
  const edited = apply(initHistory(PLAY), type("Laissez"));
  const roundTrip = apply(edited, { type: "UNDO" }, { type: "REDO" });
  assert.equal(roundTrip.present, edited.present, "le même objet, pas une copie");
});

test("une nouvelle édition après un retour en arrière coupe la branche rétablissable", () => {
  const state = apply(
    initHistory(PLAY),
    type("Laissez"),
    { type: "UNDO" },
    { type: "SET_TITLE", title: "Autre" }
  );
  assert.equal(state.future.length, 0);
});

test("annuler sans passé, rétablir sans futur : rien ne bouge", () => {
  const state = initHistory(PLAY);
  assert.equal(historyReducer(state, { type: "UNDO" }), state);
  assert.equal(historyReducer(state, { type: "REDO" }), state);
});

test("une action refusée par le reducer n'empile aucune étape", () => {
  // Sinon Ctrl+Z aurait des étapes vides à traverser, et l'étiquette
  // « Modifications non téléchargées » s'allumerait sans modification.
  const state = apply(
    initHistory(PLAY),
    { type: "ADD_CHARACTER", id: "c-neuf", name: "   " },
    { type: "MOVE_LINE", actIndex: 0, sceneIndex: 0, activeId: "l-1", overId: "l-1" }
  );
  assert.equal(state.past.length, 0);
  assert.equal(dirty(state), false);
});

// -------------------------------- « Modifications non téléchargées »

test("l'étiquette s'allume à la première vraie modification", () => {
  assert.equal(dirty(apply(initHistory(PLAY), type("Laissez"))), true);
});

test("télécharger éteint l'étiquette", () => {
  const state = apply(initHistory(PLAY), type("Laissez"), { type: "MARK_SAVED" });
  assert.equal(dirty(state), false);
});

test("annuler jusqu'à l'état téléchargé éteint l'étiquette, pile non vide", () => {
  // Éditer, télécharger, éditer, annuler : on est revenu à ce qui est publié,
  // il n'y a donc rien à télécharger, même si le passé n'est pas vide.
  const state = apply(
    initHistory(PLAY),
    type("Laissez"),
    { type: "MARK_SAVED" },
    { type: "HISTORY_BREAK" },
    type("Laissez-moi"),
    { type: "UNDO" }
  );
  assert.ok(state.past.length > 0);
  assert.equal(dirty(state), false);
});

test("après un téléchargement, la frappe suivante ouvre une NOUVELLE étape", () => {
  // MARK_SAVED remet lastKey à zéro : sans ça, la frappe suivante fusionnerait
  // dans l'étape qui a produit `saved`, et aucun Ctrl+Z ne retomberait dessus
  // (l'étiquette ne pourrait plus s'éteindre).
  const state = apply(
    initHistory(PLAY),
    type("Laissez"),
    { type: "MARK_SAVED" },
    type("Laissez-moi")
  );
  assert.equal(dirty(state), true);
  assert.equal(dirty(historyReducer(state, { type: "UNDO" })), false);
});

test("charger le script publié réinitialise la pile et n'est pas une étape", () => {
  const state = apply(
    initHistory(PLAY),
    type("Laissez"),
    { type: "LOAD_SCRIPT", script: PLAY }
  );
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 0);
  assert.equal(dirty(state), false);
});

test("le passé est plafonné, et c'est le plus ancien qui part", () => {
  let state = initHistory(PLAY);
  for (let i = 0; i < 150; i++) {
    state = apply(state, { type: "SET_TITLE", title: `Titre ${i}` }, { type: "HISTORY_BREAK" });
  }
  assert.equal(state.past.length, 100);
  assert.equal(state.present.title, "Titre 149");
  // La plus ancienne entrée gardée est bien une entrée récente, pas l'originale.
  assert.notEqual(state.past[0].title, PLAY.title);
});
