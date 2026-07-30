// Tests de la pile d'annulation de l'éditeur.
//
// Deux choses s'y jouent qui ne se voient pas à la relecture : la FUSION des
// frappes clavier (sans elle, un Ctrl+Z = une lettre) et l'étiquette
// « Modifications non téléchargées », qui n'est pas un drapeau mais une
// comparaison `present !== saved`. Les deux reposent sur l'identité des
// objets d'état, donc sur le fait qu'une action refusée n'empile rien.
import test from "node:test";
import assert from "node:assert/strict";

import { _coalesceKeyForTests, historyReducer, initHistory } from "./history.js";

const PLAY = {
  title: "Le Misanthrope",
  characters: [{ id: "c-alceste", name: "Alceste", color: "#1f77b4" }],
  acts: [
    {
      scenes: [
        {
          lines: [{ id: "l-1", characterId: "c-alceste", text: "" }],
        },
      ],
    },
  ],
};

// Deux répliques : un remplacement en touche plusieurs à la fois, c'est ce qui
// le distingue d'une frappe.
const DUO = {
  ...PLAY,
  acts: [
    {
      scenes: [
        {
          lines: [
            { id: "l-1", characterId: "c-alceste", text: "un mot" },
            { id: "l-2", characterId: "c-alceste", text: "un mot aussi" },
          ],
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

// ------------------------------------------------------ le titre de la pièce

test("renommer la pièce à la frappe ne fait qu'UNE étape", () => {
  // C'est un champ en clair, donc il se renomme lettre par lettre comme le texte
  // d'une réplique : sans fusion, revenir sur un titre demanderait un Ctrl+Z par
  // caractère. Le titre de la pièce est le SEUL nom qui reste, les actes et les
  // scènes tirant leur libellé de leur rang.
  const state = apply(
    initHistory(PLAY),
    { type: "SET_TITLE", title: "L" },
    { type: "SET_TITLE", title: "Le M" },
    { type: "SET_TITLE", title: "Le Misanthrope" }
  );
  assert.equal(state.present.title, "Le Misanthrope");
  assert.equal(state.past.length, 1);
  assert.equal(historyReducer(state, { type: "UNDO" }).present.title, PLAY.title);
});

test("aucune clé de fusion ne désigne son objet par un RANG", () => {
  // L'invariant qui remplace une vieille précaution. Les renommages d'acte et de
  // scène se cléaient sur un rang, faute d'id, et ça ne tenait que parce que tout
  // ce qui déplace un rang ferme la rafale. Ils n'existent plus, donc plus une
  // seule clé n'est un rang, et ça doit rester vrai : une action rank-cléée
  // ajoutée sans cette précaution ferait fusionner deux objets différents dans la
  // même étape d'annulation.
  const suspects = [
    { type: "EDIT_TEXT", actIndex: 3, sceneIndex: 2, lineId: "l-1", text: "x" },
    { type: "SET_TITLE", title: "x" },
    { type: "SET_LANGUAGE", language: "en" },
    { type: "MOVE_ACT", from: 0, to: 1 },
    { type: "MOVE_SCENE", actIndex: 0, from: 0, to: 1 },
    { type: "ADD_ACT" },
    { type: "DELETE_ACT", actIndex: 0 },
  ];
  for (const action of suspects) {
    const key = _coalesceKeyForTests(action);
    if (key === null) continue;
    for (const field of ["actIndex", "sceneIndex", "from", "to"]) {
      if (action[field] === undefined) continue;
      assert.ok(
        !key.includes(String(action[field])),
        `${action.type} : la clé « ${key} » contient le rang ${field}=${action[field]}`
      );
    }
  }
});

test("changer la langue de la pièce est une étape à part entière", () => {
  // C'est un select, pas une frappe : rien à fusionner, et il ne doit surtout pas
  // se fondre dans la rafale du titre juste au-dessus de lui dans le panneau.
  const state = apply(
    initHistory(PLAY),
    { type: "SET_TITLE", title: "Autre" },
    { type: "SET_LANGUAGE", language: "en" },
    { type: "SET_TITLE", title: "Encore" }
  );
  assert.equal(state.past.length, 3);
  assert.equal(state.present.language, "en");
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

// ------------------------------------------- remplacement (recherche)

test("un remplacement de plusieurs répliques ne fait qu'UNE étape d'annulation", () => {
  // C'est toute la raison d'une action de lot : une boucle d'EDIT_TEXT en
  // aurait fait une par réplique (les clés de fusion diffèrent par lineId),
  // donc autant de Ctrl+Z que de répliques touchées.
  const before = initHistory(DUO);
  const state = historyReducer(before, {
    type: "SET_LINE_TEXTS",
    edits: [
      { lineId: "l-1", text: "un terme" },
      { lineId: "l-2", text: "un terme aussi" },
    ],
  });
  assert.equal(state.past.length, 1);
  // La pile restitue l'OBJET d'avant, pas un équivalent : c'est ce qui permet
  // à `dirty` de se comparer par identité.
  assert.equal(historyReducer(state, { type: "UNDO" }).present, before.present);
});

test("un remplacement ne fusionne jamais avec une rafale de frappes", () => {
  // Ni dans un sens ni dans l'autre. Avec un EDIT_TEXT à la place, le
  // remplacement aurait laissé la rafale OUVERTE sur cette réplique, et un
  // seul Ctrl+Z aurait annulé la frappe suivante avec lui.
  const state = apply(
    initHistory(PLAY),
    type("La"),
    { type: "SET_LINE_TEXTS", edits: [{ lineId: "l-1", text: "Remplacé" }] },
    type("Lb")
  );
  assert.equal(state.past.length, 3);
});

test("un remplacement sans occurrence n'empile rien et n'allume pas l'étiquette", () => {
  const state = apply(initHistory(PLAY), { type: "SET_LINE_TEXTS", edits: [] });
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
