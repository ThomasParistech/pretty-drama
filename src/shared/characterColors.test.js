// Tests de la palette des personnages.
//
// Ce qui se teste ici est exactement ce qui ne se relit pas à l'œil : que le
// comblement des couleurs soit DÉTERMINISTE (l'Édition et la Répartition le
// rejouent séparément sur les mêmes personnages et doivent tomber d'accord),
// qu'il ne donne pas deux fois la même couleur avant d'avoir épuisé la palette,
// et que les dix premières entrées soient bien Tableau 10 (c'est la promesse
// faite à une troupe de dix personnages ou moins : la palette à pleine force,
// aucune teinte pâle).
import test from "node:test";
import assert from "node:assert/strict";

import {
  CHARACTER_COLOR_KEYS,
  CHARACTER_COLORS,
  assignColors,
  characterColor,
  characterInk,
  firstFreeColor,
  isPaletteColor,
} from "./characterColors.js";

const TAB10 = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
];

const cast = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `P${i}` }));

// ------------------------------------------------------------------ palette

test("les dix premières couleurs sont Tableau 10, dans son ordre", () => {
  // La promesse de la page Répartition : une troupe de dix personnages ou moins
  // ne voit que le registre canonique, jamais une teinte claire de tab20.
  assert.deepEqual(CHARACTER_COLORS.slice(0, 10), TAB10);
});

test("la palette fait vingt couleurs distinctes, toutes en hex minuscule", () => {
  assert.equal(CHARACTER_COLORS.length, 20);
  assert.equal(new Set(CHARACTER_COLORS).size, 20, "aucun doublon dans la palette");
  for (const c of CHARACTER_COLORS) assert.match(c, /^#[0-9a-f]{6}$/, `couleur : ${c}`);
});

test("chaque couleur a sa clé de nom, sinon une pastille s'annonce « undefined »", () => {
  // Ces clés servent d'`aria-label` aux vingt pastilles de la palette de
  // l'éditeur, indexées par rang : une liste plus courte y mettrait `undefined`,
  // et seul un lecteur d'écran s'en apercevrait. Que la clé EXISTE dans les deux
  // catalogues est vérifié ailleurs (test_contracts.py, qui relève les `t("…")`
  // littéraux et les clés construites par motif).
  assert.equal(CHARACTER_COLOR_KEYS.length, CHARACTER_COLORS.length);
  assert.equal(new Set(CHARACTER_COLOR_KEYS).size, CHARACTER_COLOR_KEYS.length, "pas d'homonyme");
  for (const key of CHARACTER_COLOR_KEYS) {
    assert.match(key, /^color\.[a-zA-Z]+$/, `clé : ${key}`);
  }
});

test("isPaletteColor n'accepte que la palette, et tolère toute autre entrée", () => {
  assert.ok(isPaletteColor("#1f77b4"));
  assert.ok(isPaletteColor("#1F77B4"), "un script.json hand-édité peut crier");
  for (const value of [null, undefined, 42, "", "rouge", "#123456", "oklch(0.58 0.14 255)", {}, []]) {
    assert.equal(isPaletteColor(value), false, `entrée : ${JSON.stringify(value)}`);
  }
});

// ------------------------------------------------------------- firstFreeColor

test("firstFreeColor rend la première libre, puis boucle une fois la palette épuisée", () => {
  assert.equal(firstFreeColor(new Set()), CHARACTER_COLORS[0]);
  assert.equal(firstFreeColor(new Set([CHARACTER_COLORS[0]])), CHARACTER_COLORS[1]);
  // Palette épuisée : on reboucle plutôt que de rendre undefined, sinon un
  // 21e personnage n'aurait aucune couleur et la légende afficherait un trou.
  const full = new Set(CHARACTER_COLORS);
  assert.equal(firstFreeColor(full, 20), CHARACTER_COLORS[0]);
  // Et la boucle AVANCE. Le compte est passé à part parce que `used` cesse de
  // grandir dès la palette épuisée : s'en servir donnait la même couleur à tous
  // les personnages au-delà du vingtième.
  assert.equal(firstFreeColor(full, 21), CHARACTER_COLORS[1]);
  assert.equal(firstFreeColor(full, 43), CHARACTER_COLORS[3]);
});

// --------------------------------------------------------------- assignColors

test("une distribution sans couleurs reçoit la palette dans l'ordre", () => {
  // C'est le cas RÉEL : le script.json publié ne portait aucune couleur.
  const colors = assignColors(cast(10));
  assert.deepEqual([...colors.values()], TAB10);
});

test("le comblement est déterministe, donc deux pages tombent d'accord", () => {
  const characters = cast(7);
  assert.deepEqual([...assignColors(characters).values()], [...assignColors(characters).values()]);
});

test("une couleur déjà choisie est gardée, et ne se redonne pas à un autre", () => {
  const colors = assignColors([
    { id: "a", name: "Alceste", color: "#2ca02c" },
    { id: "b", name: "Philinte" },
    { id: "c", name: "Oronte" },
  ]);
  assert.equal(colors.get("a"), "#2ca02c", "le choix du responsable survit");
  assert.equal(colors.get("b"), "#1f77b4", "le premier libre, pas le premier tout court");
  assert.equal(colors.get("c"), "#ff7f0e");
});

test("une couleur étrangère ou dupliquée est remplacée, jamais conservée", () => {
  const colors = assignColors([
    { id: "a", name: "A", color: "#1f77b4" },
    { id: "b", name: "B", color: "#1f77b4" },
    { id: "c", name: "C", color: "chartreuse" },
    { id: "d", name: "D", color: null },
  ]);
  assert.equal(colors.get("a"), "#1f77b4");
  assert.notEqual(colors.get("b"), "#1f77b4", "le doublon repart avec une couleur neuve");
  assert.equal(new Set(colors.values()).size, 4, "quatre personnages, quatre couleurs");
  for (const color of colors.values()) assert.ok(isPaletteColor(color));
});

test("aucune couleur ne se répète avant que la palette soit épuisée", () => {
  const colors = assignColors(cast(20));
  assert.equal(new Set(colors.values()).size, 20);
});

test("au-delà de vingt, la palette boucle vraiment au lieu de se figer", () => {
  // Le piège : `used` cesse de grandir quand la palette est épuisée, donc un
  // repli calculé dessus donnait #1f77b4 au 21e comme au 25e, et une troupe de
  // 25 personnages avait cinq personnages du même bleu.
  const colors = assignColors(cast(25));
  assert.equal(colors.size, 25);
  assert.deepEqual(
    [20, 21, 22, 23, 24].map((i) => colors.get(`c${i}`)),
    CHARACTER_COLORS.slice(0, 5)
  );
  for (const color of colors.values()) assert.ok(isPaletteColor(color));
});

test("assignColors encaisse une distribution douteuse sans planter", () => {
  // Miroir tolérant de sanitize_script : le manifest peut être hand-édité.
  for (const raw of [null, undefined, 42, "texte", {}, [null, 42, "x", { name: "sans id" }]]) {
    assert.doesNotThrow(() => assignColors(raw), `entrée : ${JSON.stringify(raw)}`);
  }
  assert.equal(assignColors([{ id: "a", name: "A" }, { id: "a", name: "Aussi A" }]).size, 1);
});

// ------------------------------------------------------------ characterColor

test("characterColor lit la couleur stockée, sans la combler", () => {
  // Contrairement à `assignColors` : c'est l'appel par rangée de réplique de
  // l'éditeur, dont `sanitizeScript` garantit déjà la couleur. Combler ici
  // reconstruirait la distribution entière à chaque rangée.
  const characters = [{ id: "a", name: "A", color: "#2ca02c" }, { id: "b", name: "B" }];
  assert.equal(characterColor(characters, "a"), "#2ca02c");
  assert.equal(characterColor(characters, "b"), null, "pas de couleur stockée, pas de couleur");
  assert.equal(characterColor(characters, "fantome"), null);
  assert.equal(characterColor(characters, null), null);
  assert.equal(characterColor(null, "a"), null);
});

test("characterColor refuse une couleur hors palette plutôt que de la peindre", () => {
  // Elle finirait dans un attribut `style` : on rend null et l'appelant pose
  // son token neutre.
  assert.equal(characterColor([{ id: "a", color: "chartreuse" }], "a"), null);
});

// -------------------------------------------------------------- characterInk

test("characterInk plafonne la clarté et garde la chroma de la couleur", () => {
  // Le plafond, pas un mélange avec du noir : mélanger éteignait la couleur en
  // même temps qu'il la fonçait, et dans l'éditeur le nom du personnage se
  // lisait comme du noir. Cf. le commentaire de `characterInk`.
  assert.equal(characterInk("#bcbd22"), "oklch(from #bcbd22 min(l, 0.5) c h)");
  for (const color of CHARACTER_COLORS) {
    const ink = characterInk(color);
    assert.match(ink, /^oklch\(from #[0-9a-f]{6} min\(l, 0\.5\) c h\)$/, `couleur : ${color}`);
    assert.ok(ink.includes(" c h)"), "la chroma et la teinte sont reprises telles quelles");
  }
});
