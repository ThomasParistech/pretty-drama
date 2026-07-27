// Tests des helpers purs partagés par les pages.
//
// `githubUploadUrl` est le geste quotidien du respo : une erreur ici et le
// bouton de dépôt de l'Avancement mène à un 404 sur GitHub, sans que rien
// dans le site ne le signale. Il se teste en posant un faux `window.location`,
// la seule chose qu'il lise.
import test from "node:test";
import assert from "node:assert/strict";

import { githubUploadUrl, myLineNumbers, slugify } from "./data.js";

// Le module ne touche à `window` que dans le corps des fonctions : il suffit
// donc de le poser avant l'appel. Les cas hors github.io s'appuient sur
// `import.meta.env`, injecté par Vite et absent de Node : ils ne sont pas
// couverts ici (le comportement voulu y est « rendre null », et l'appelant
// masque alors la carte).
const atUrl = (href) => {
  const { hostname, pathname } = new URL(href);
  globalThis.window = { location: { hostname, pathname } };
};

test("site de projet : le dépôt est le premier segment du chemin", () => {
  atUrl("https://les-troubadours.github.io/ma-piece/dashboard.html");
  assert.equal(
    githubUploadUrl(),
    "https://github.com/les-troubadours/ma-piece/upload/master/uploads"
  );
});

test("site racine : le dépôt porte le nom du domaine, pas le nom de fichier", () => {
  // Sans ce cas, le bouton pointait vers github.com/<owner>/dashboard.html.
  atUrl("https://les-troubadours.github.io/dashboard.html");
  assert.equal(
    githubUploadUrl(),
    "https://github.com/les-troubadours/les-troubadours.github.io/upload/master/uploads"
  );
});

test("site racine à la racine même : pas de segment à confondre avec un dépôt", () => {
  atUrl("https://les-troubadours.github.io/");
  assert.equal(
    githubUploadUrl(),
    "https://github.com/les-troubadours/les-troubadours.github.io/upload/master/uploads"
  );
});

test("l'URL de dépôt vise le dossier uploads/, seule adresse à connaître", () => {
  atUrl("https://troupe.github.io/piece/dashboard.html");
  assert.match(githubUploadUrl(), /\/upload\/master\/uploads$/);
});

// ------------------------------------------------------------------ slugify

test("slugify rend un nom de fichier sûr et lisible", () => {
  assert.equal(slugify("Serge"), "serge");
  assert.equal(slugify("Éléonore d'Aquitaine"), "eleonore-d-aquitaine");
  assert.equal(slugify("  Jean-Baptiste  "), "jean-baptiste");
});

test("slugify ne rend jamais une chaîne vide ni de caractère hasardeux", () => {
  for (const name of ["", "   ", "!!!", "日本語", "../.."]) {
    const slug = slugify(name);
    assert.match(slug, /^[a-z0-9-]+$/, `nom : ${JSON.stringify(name)}`);
  }
  assert.equal(slugify("!!!"), "personnage");
});

// ------------------------------------------------------------ myLineNumbers

test("myLineNumbers numérote MES répliques dans l'ordre de la scène", () => {
  const lines = [
    { id: "a", characterId: "c1" },
    { id: "b", characterId: "c2" },
    { id: "c", characterId: "c1" },
  ];
  const numbers = myLineNumbers(lines, "c1");
  assert.equal(numbers.get("a"), 1);
  assert.equal(numbers.get("c"), 2);
  assert.equal(numbers.get("b"), undefined);
  assert.equal(numbers.size, 2, "le total affiché « (n/total) »");
});

test("sans personnage choisi, personne n'est numéroté", () => {
  const lines = [{ id: "a", characterId: "c1" }];
  assert.equal(myLineNumbers(lines, "").size, 0);
});
