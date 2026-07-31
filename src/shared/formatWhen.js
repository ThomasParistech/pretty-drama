import { fmt } from "./locale.js";

// La date d'un dépôt, année comprise (un journal se relit des mois plus tard, et
// deux saisons de répétitions passent par les mêmes jours). Rend null sur un
// horodatage illisible, plutôt que d'afficher « Invalid Date ».
//
// `fmt.dateTime` remplace deux `toLocale*` figés sur « fr-FR » et le mot de
// liaison « à » qui les joignait : le format d'une locale porte son propre
// séparateur (une virgule en anglais), donc il n'y avait rien à traduire, juste
// à cesser de l'écrire à la main.
//
// Partagé depuis que deux pages datent un dépôt : le journal de l'Avancement d'une
// pièce, et la carte de chaque pièce sur la page de gestion, où la date du dernier
// dépôt fait office de témoin de vie. Un module à part et pas une fonction de
// `data.js` : celui-là est couvert par `node --test` et ne peut pas importer
// `locale.js`, qui lit l'URL, le stockage et le navigateur dès son import.
export default function formatWhen(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return fmt.dateTime(then);
}
