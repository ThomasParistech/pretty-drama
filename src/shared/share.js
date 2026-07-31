// Comment s'écrit une PART, et le seuil qui l'empêche de mentir.
//
// Partagé depuis que deux pages en écrivent une : la légende de la Répartition, et la
// carte d'une pièce sur les deux pages racine (« 12,4 % enregistré »). C'est la même
// mesure et la même règle d'arrondi, donc la même implémentation : la dupliquer aurait
// laissé une page dire « 0,0 % » là où l'autre dit « < 0,1 % », sur le même chiffre.
//
// Module PUR : `t` et `fmt` sont PASSÉS, comme à `actLabel`, donc il reste couvert par
// `node --test` et ne peut pas importer `locale.js`, qui lit l'URL et le navigateur.

// Part en pourcentage. Rendue par ce module et pas calculée dans le JSX : c'est
// la seule division de la page, et « 0 % » sur une part non nulle se lirait
// comme un bug (cf. `formatShare`, qui s'en charge).
export function share(value, total) {
  if (!total) return 0;
  return (value * 100) / total;
}

// La part telle qu'elle s'écrit dans une légende : un chiffre après la décimale,
// comme le `%1.1f%%` de la référence.
//
// Ici et pas dans le JSX, comme tout ce qui peut se tromper : le seuil ci-dessous
// est une règle, pas un dessin, donc `node --test` le rejoue. `t` et `fmt` sont
// PASSÉS, comme à `actLabel` : ce module reste pur, donc testable sans DOM.
//
// La virgule décimale et l'espace avant le signe ne sont plus écrits à la main :
// `Intl.NumberFormat` les tient, et il les tient MIEUX. Le code d'avant faisait
// un `.replace(".", ",")` et posait une espace ORDINAIRE avant le `%`, ce que
// `.stats-legend-share { white-space: nowrap }` devait rattraper ; Intl produit
// une vraie insécable U+00A0 en français et rien du tout en anglais (« 12.4% »).
// Le `nowrap` devient donc une ceinture de plus, gardée et sans effet.
export function formatShare(value, total, t, fmt) {
  const ratio = total ? value / total : 0;
  // Une part non nulle n'affiche JAMAIS « 0,0 % » : un mot sur les dix mille de
  // la pièce y tombait, et un zéro en face d'un décompte de 1 se lit comme un
  // bug d'arrondi, ce que le commentaire de `share` veut justement éviter. En
  // dessous du dixième de point, on dit le seuil et pas la valeur.
  //
  // Le seuil lui-même est FORMATÉ et non écrit en dur : « < 0,1 % » en français,
  // « < 0.1% » en anglais, sans qu'un catalogue ait à connaître le chiffre.
  if (ratio > 0 && ratio < 0.0005) return t("stats.shareBelow", { value: fmt.percent(0.001) });
  return fmt.percent(ratio);
}
