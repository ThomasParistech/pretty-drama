// Comment s'écrit une part, et le seuil qui l'empêche de mentir. Deux pages en
// écrivent une (la légende de la Répartition, la carte d'une pièce sur les deux pages
// racine), donc la règle vit dans un seul module et son test avec elle.
import test from "node:test";
import assert from "node:assert/strict";

import { makeFormats, makeT } from "./i18n.js";
import { formatShare, share } from "./share.js";

// Le seul message dont `formatShare` a besoin. Un catalogue local plutôt que le
// vrai : ces tests portent sur l'arithmétique du seuil et sur la typographie
// d'Intl, pas sur la formulation, qui peut être reprise sans les casser.
const SHARE_CATALOGUES = {
  fr: { "stats.shareBelow": "< {value}" },
  en: { "stats.shareBelow": "< {value}" },
};

test("share ne divise jamais par zéro", () => {
  assert.equal(share(3, 12), 25);
  assert.equal(share(0, 0), 0, "une portée vide : 0 %, pas NaN dans le dessin");
  assert.equal(share(5, 0), 0);
});

// `formatShare` prend `t` et `fmt` en argument, comme `actLabel` : le module reste
// pur, et les tests fournissent de vrais formateurs plutôt que des doublures, ce
// qui vérifie du même coup que la typographie sort bien d'Intl.
const FR = { t: makeT("fr", SHARE_CATALOGUES), fmt: makeFormats("fr") };
const EN = { t: makeT("en", SHARE_CATALOGUES), fmt: makeFormats("en") };
// U+00A0 nommée : Intl la produit avant le `%` en français, et elle est
// indistinguable d'une espace ordinaire dans un littéral.
const NBSP = "\u00a0";
const shareFr = (v, total) => formatShare(v, total, FR.t, FR.fmt);
const shareEn = (v, total) => formatShare(v, total, EN.t, EN.fmt);

test("formatShare écrit la part avec un chiffre après la décimale", () => {
  assert.equal(shareFr(3, 12), `25,0${NBSP}%`);
  assert.equal(shareFr(1, 3), `33,3${NBSP}%`);
  assert.equal(shareFr(12, 12), `100,0${NBSP}%`);
  // Une part nulle est un vrai zéro : c'est la légende d'un personnage qui a des
  // répliques et pas un mot (une réplique vide), et là « 0,0 % » est exact.
  assert.equal(shareFr(0, 12), `0,0${NBSP}%`);
  assert.equal(shareFr(0, 0), `0,0${NBSP}%`, "portée vide : jamais NaN à l'écran");
});

test("la typographie de la part suit la langue, et vient d'Intl", () => {
  // Le code d'avant faisait un `.replace(".", ",")` et une espace ordinaire avant
  // le `%`. Intl rend la virgule ET une vraie insécable en français, et ni l'une
  // ni l'autre en anglais.
  assert.equal(shareEn(1, 3), "33.3%");
  assert.equal(shareEn(12, 12), "100.0%");
  assert.ok(shareFr(1, 3).includes(`${NBSP}%`), "insécable U+00A0 avant le signe");
  assert.ok(!/\s/.test(shareEn(1, 3)), "aucune espace en anglais");
});

test("une part non nulle n'affiche jamais « 0,0 % »", () => {
  // Un mot sur les dix mille de la pièce : l'arrondi le montrerait à zéro en face
  // d'un décompte de 1, ce qui se lit comme un bug. En dessous du dixième de
  // point, on dit le seuil et pas la valeur.
  assert.equal(shareFr(1, 10307), `< 0,1${NBSP}%`);
  assert.equal(shareFr(1, 2001), `< 0,1${NBSP}%`, "juste sous le seuil d'arrondi");
  assert.equal(shareFr(1, 2000), `0,1${NBSP}%`, "au seuil, l'arrondi suffit");
  // Le seuil est formaté, pas écrit en dur : l'anglais n'a ni virgule ni espace.
  assert.equal(shareEn(1, 10307), "< 0.1%");
});

