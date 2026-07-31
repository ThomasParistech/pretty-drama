// L'identité d'une pièce : l'identifiant qui nomme son dossier.
//
// Une pièce vit dans `plays/<id>/` (ses pages, ses données, ses clips) et sa zone
// de dépôt est `uploads/<id>/`, donc cet identifiant est à la fois un nom de
// dossier et un segment d'URL, que la troupe lit dans sa barre d'adresse : d'où un
// slug tiré du titre plutôt qu'un UUID comme pour les répliques, qui ne nomment
// que des fichiers mp3.
//
// Il est minté UNE fois, à la création de la pièce, et ne change JAMAIS ensuite,
// sur le motif qui interdit de recycler un id de réplique : renommer la pièce
// change son titre, pas son dossier. Le faire suivre casserait les liens déjà
// donnés aux acteurs, et laisserait derrière lui un dossier de clips que plus rien
// ne réclame.
//
// Module PUR (aucun DOM, aucun stockage, aucun `window`) : il est couvert par
// `node --test` et importé aussi bien par le reducer de l'Édition que par la page
// de gestion des pièces.

import { slugify } from "./data.js";

// Miroir de PLAY_ID_PATTERN dans scripts/common.py, à garder synchrone : un garde
// de scripts/tests/test_contracts.py compare les deux expressions au caractère
// près, comme il le fait pour les ids de répliques.
//
// Minuscules, chiffres et tirets, jamais un tiret en tête : c'est exactement ce
// que `slugify` (src/shared/data.js) produit, et un nom de dossier qui commence
// par un tiret se lit comme une option en ligne de commande. Borné à 64
// caractères comme un id de réplique, pour la même raison : il nomme un chemin.
export const SAFE_PLAY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isPlayId(value) {
  return typeof value === "string" && SAFE_PLAY_ID.test(value);
}

// La borne du motif ci-dessus, écrite une fois : `mintPlayId` doit tronquer à la
// même longueur, sinon un titre à rallonge produirait un identifiant que le site
// vient de fabriquer et que l'Action refuserait.
export const MAX_PLAY_ID_LENGTH = 64;

// L'identifiant d'une pièce à créer, dérivé de son titre.
//
// `slugify` est le seul fabricant de slug du projet (src/shared/data.js) : il est
// déjà ce qui nomme le ZIP des prises et le PDF de la pièce, et sa sortie
// (minuscules, chiffres, tirets, sans tiret aux extrémités) est exactement ce que
// SAFE_PLAY_ID accepte. Il ne reste qu'à borner la longueur, la troncature pouvant
// laisser un tiret en fin de chaîne.
//
// Rend la chaîne vide quand le titre ne laisse rien (vide, ou tout en ponctuation) :
// l'appelant demande alors un autre titre plutôt que de fabriquer un dossier nommé
// « piece-1 » qui ne dirait rien à personne.
export function mintPlayId(title) {
  const base = slugify(typeof title === "string" ? title : "", "");
  return base.slice(0, MAX_PLAY_ID_LENGTH).replace(/-+$/g, "");
}

// La pièce vide que la page de gestion fait télécharger pour en créer une.
//
// Miroir d'`EMPTY_SCRIPT` (src/editor/reducer.js), et un test les tient en accord :
// c'est le même document, l'un servant de repli à l'éditeur et l'autre de graine à
// une pièce neuve. L'acte et la scène vides ne sont pas décoratifs, c'est le
// plancher de structure que l'éditeur pose lui aussi, parce qu'il faut bien une
// scène où écrire la première réplique.
export function newPlayScript(id, title, language) {
  return { id, title, language, characters: [], acts: [{ scenes: [{ lines: [] }] }] };
}
