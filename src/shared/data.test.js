// `githubUploadUrl` is the coordinator's daily gesture and nothing on the site
// reports a mistake in it. Tested with a fake `window.location`, all it reads.
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXCERPT_MAX,
  excerpt,
  githubNewPlayUrl,
  githubUploadUrl,
  myLineNumbers,
  sceneChoices,
  actChoices,
  slugify,
} from "./data.js";
import { isPlayId } from "./plays.js";

// `window` is only touched inside function bodies, so setting it before the call is
// enough. The non-github.io cases read `import.meta.env` (Vite, absent from Node) and
// are not covered here.
const atUrl = (href) => {
  const { hostname, pathname } = new URL(href);
  globalThis.window = { location: { hostname, pathname } };
};

test("project site: the repository is the first segment of the path", () => {
  atUrl("https://les-troubadours.github.io/mon-depot/plays/ma-piece/dashboard.html");
  assert.equal(
    githubUploadUrl("ma-piece"),
    "https://github.com/les-troubadours/mon-depot/upload/main/uploads/ma-piece"
  );
});

test("root site: the repository is named after the domain, not after the file", () => {
  atUrl("https://les-troubadours.github.io/respo.html");
  assert.equal(
    githubUploadUrl(),
    "https://github.com/les-troubadours/les-troubadours.github.io/upload/main/uploads"
  );
});

test("root site at the very root: no segment to mistake for a repository", () => {
  atUrl("https://les-troubadours.github.io/");
  assert.equal(
    githubUploadUrl(),
    "https://github.com/les-troubadours/les-troubadours.github.io/upload/main/uploads"
  );
});

test("root site, a play's page: \"plays\" is not a repository name", () => {
  // Invisible to the eye: two levels down, the first segment looks like a repo name.
  atUrl("https://les-troubadours.github.io/plays/ma-piece/dashboard.html");
  assert.equal(
    githubUploadUrl("ma-piece"),
    "https://github.com/les-troubadours/les-troubadours.github.io/upload/main/uploads/ma-piece"
  );
});

test("the upload URL aims at the PLAY's area, the one its button designates", () => {
  // The FOLDER routes, never the content: a damaged ZIP still reaches its play.
  atUrl("https://troupe.github.io/depot/plays/piece/dashboard.html");
  assert.match(githubUploadUrl("piece"), /\/upload\/main\/uploads\/piece$/);
});

test("with no play named, the upload URL aims at the root, the creation channel", () => {
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(githubUploadUrl(), /\/upload\/main\/uploads$/);
});

test("the upload URL names the branch the fork really has", () => {
  // GitHub serves `/upload/<branch>` only for a branch that EXISTS, and otherwise
  // lands on the repo home page: a plausible page and no error.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(githubUploadUrl("piece"), /\/upload\/main\//);
});

// --------------------------------------------------------- githubNewPlayUrl

test("creating a play opens GitHub's editor on a file in the upload area", () => {
  atUrl("https://les-troubadours.github.io/mon-depot/respo.html");
  assert.equal(
    githubNewPlayUrl("l-ecole-des-femmes", "L'École des femmes", "Commit as is."),
    "https://github.com/les-troubadours/mon-depot/new/main" +
      "?filename=uploads/_new-play/l-ecole-des-femmes.txt" +
      "&value=L'%C3%89cole%20des%20femmes%0A---%0ACommit%20as%20is.%0A"
  );
});

test("the file says the title on its first line, then the note for the human", () => {
  // The Action reads the first line and stops at the separator; the note is for the
  // human reading GitHub's editor box.
  atUrl("https://troupe.github.io/depot/respo.html");
  const url = githubNewPlayUrl("antigone", "Antigone", "Ligne une.\nLigne deux.");
  const content = decodeURIComponent(url.match(/&value=(.*)$/)[1]);
  assert.equal(content, "Antigone\n---\nLigne une.\nLigne deux.\n");
  assert.equal(content.split("\n")[0], "Antigone");
});

test("the file lands in the creation zone, which is what routes it", () => {
  // The FOLDER is the whole instruction: name and extension are editable fields on
  // that page, so the Action reads neither.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(
    githubNewPlayUrl("antigone", "Antigone", "note"),
    /filename=uploads\/_new-play\/antigone\.txt&/
  );
});

test("the creation zone can never be the name of a play", () => {
  atUrl("https://troupe.github.io/depot/respo.html");
  const url = githubNewPlayUrl("antigone", "Antigone", "note");
  const zone = url.match(/filename=uploads\/([^/]+)\//)[1];
  assert.ok(!isPlayId(zone), `"${zone}" is a valid play id`);
});

test("the path keeps its slash literal, so GitHub reads it as a path", () => {
  // Percent-encoded, GitHub reads the whole value as a file NAME and the play lands at
  // the repo root, where no Action watches.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.ok(!githubNewPlayUrl("antigone", "Antigone", "note").includes("%2F"));
});

test("the file is proposed as .txt, which is a courtesy and not a contract", () => {
  // The Action reads no extension there, so this guards the courtesy, not the routing.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(githubNewPlayUrl("antigone", "Antigone", "note"), /\.txt(&|$)/);
});

test("the title is encoded, so nothing it holds can cut the query short", () => {
  atUrl("https://troupe.github.io/depot/respo.html");
  // A space, an ampersand and a hash: the three characters that would cut the query
  // short or open a second parameter.
  const url = githubNewPlayUrl("piece", "Un & Deux #3", "note");
  assert.match(url, /&value=Un%20%26%20Deux%20%233%0A/);
});

test("the creation URL names the branch the fork really has", () => {
  // Same trap and same silence as the upload URL.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(githubNewPlayUrl("piece", "Pièce", "note"), /\/new\/main\?/);
});

// ------------------------------------------------------------------ slugify

test("slugify returns a safe and readable file name", () => {
  assert.equal(slugify("Serge", "x"), "serge");
  assert.equal(slugify("Éléonore d'Aquitaine", "x"), "eleonore-d-aquitaine");
  assert.equal(slugify("  Jean-Baptiste  ", "x"), "jean-baptiste");
});

test("slugify never returns an empty string nor a risky character", () => {
  for (const name of ["", "   ", "!!!", "日本語", "../.."]) {
    const slug = slugify(name, "repli");
    assert.match(slug, /^[a-z0-9-]+$/, `name: ${JSON.stringify(name)}`);
  }
  assert.equal(slugify("!!!", "repli"), "repli");
});

test("slugify's fallback is chosen per caller, and on the result", () => {
  // The trap: a title can be non-empty AND slug to nothing ("???"), so the fallback is
  // decided on the RESULT and not on the input.
  assert.equal(slugify("Transport de Femmes", "script"), "transport-de-femmes");
  assert.equal(slugify("", "script"), "script");
  assert.equal(slugify("???", "script"), "script");
  assert.equal(slugify("   ", "script"), "script");
  assert.equal(slugify("Personnage", "script"), "personnage");
});

// ------------------------------------------------------------ myLineNumbers

test("myLineNumbers numbers MY lines in the order of the scene", () => {
  const lines = [
    { id: "a", characterId: "c1" },
    { id: "b", characterId: "c2" },
    { id: "c", characterId: "c1" },
  ];
  const numbers = myLineNumbers(lines, "c1");
  assert.equal(numbers.get("a"), 1);
  assert.equal(numbers.get("c"), 2);
  assert.equal(numbers.get("b"), undefined);
  assert.equal(numbers.size, 2, "the total displayed as \"(n/total)\"");
});

test("with no character chosen, nobody is numbered", () => {
  const lines = [{ id: "a", characterId: "c1" }];
  assert.equal(myLineNumbers(lines, "").size, 0);
});

// -------------------------------------------------------------- sceneChoices

const ACT = [
  { lines: [{ characterId: "c1" }, { characterId: "c2" }] },
  { lines: [{ characterId: "c2" }] },
  { lines: [{ characterId: "c2" }, { characterId: "c1" }] },
];

test("sceneChoices keeps only the scenes where the character speaks", () => {
  assert.deepEqual(sceneChoices(ACT, "c1"), [0, 2]);
});

test("sceneChoices returns INDEXES into the act, never a renumbering", () => {
  // Renumbered 0,1 the reader would land on scene 2 when asking for scene 3.
  const kept = sceneChoices(ACT, "c1");
  assert.equal(kept[1], 2);
});

test("with no character chosen, sceneChoices offers the whole act", () => {
  assert.deepEqual(sceneChoices(ACT, ""), [0, 1, 2]);
});

test("a character silent in the whole act gets the whole act, not an empty menu", () => {
  assert.deepEqual(sceneChoices(ACT, "ghost"), [0, 1, 2]);
});

test("sceneChoices takes an act with no scene at all", () => {
  assert.deepEqual(sceneChoices([], "c1"), []);
});

// ---------------------------------------------------------------- actChoices

const PLAY = [
  { scenes: [{ lines: [{ characterId: "c1" }] }, { lines: [] }] },
  { scenes: [{ lines: [{ characterId: "c2" }] }] },
  { scenes: [{ lines: [{ characterId: "c2" }, { characterId: "c1" }] }] },
];

test("actChoices keeps only the acts where the character speaks, by INDEX", () => {
  assert.deepEqual(actChoices(PLAY, "c1"), [0, 2]);
});

test("with no character chosen, actChoices offers the whole play", () => {
  assert.deepEqual(actChoices(PLAY, ""), [0, 1, 2]);
});

test("a character silent in the whole play gets every act, not an empty menu", () => {
  assert.deepEqual(actChoices(PLAY, "ghost"), [0, 1, 2]);
});

test("actChoices takes a play with no act at all", () => {
  assert.deepEqual(actChoices([], "c1"), []);
});

// ------------------------------------------------------------------- excerpt

test("excerpt quotes a short line as it is, with no ellipsis", () => {
  assert.equal(excerpt("  Être ou ne pas être.  "), "Être ou ne pas être.");
  assert.equal(excerpt(""), "");
  assert.equal(excerpt(undefined), "", "line with no text: empty quotation, no crash");
});

test("excerpt shortens a long speech and says so", () => {
  const tirade = "a".repeat(EXCERPT_MAX + 50);
  const quoted = excerpt(tirade);
  assert.equal(quoted.length, EXCERPT_MAX + 1, "the ellipsis on top of the cut");
  assert.ok(quoted.endsWith("…"));
  assert.equal(excerpt("a".repeat(EXCERPT_MAX)), "a".repeat(EXCERPT_MAX));
});
