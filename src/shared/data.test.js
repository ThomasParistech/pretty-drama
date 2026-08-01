// Tests for the pure helpers shared by the pages.
//
// `githubUploadUrl` is the coordinator's daily gesture: one mistake here and the
// upload button of the Progress page goes nowhere, with nothing in the site
// reporting it. It is tested by setting a fake `window.location`, the only thing
// it reads.
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXCERPT_MAX,
  excerpt,
  githubNewPlayUrl,
  githubUploadUrl,
  myLineNumbers,
  sceneChoices,
  slugify,
} from "./data.js";
import { isPlayId } from "./plays.js";

// The module only touches `window` inside function bodies: it is therefore enough
// to set it before the call. The cases outside github.io rely on
// `import.meta.env`, injected by Vite and absent from Node: they are not covered
// here (the intended behaviour there is "return null", and the caller then hides
// the card).
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
  // Without this case, the button pointed at github.com/<owner>/dashboard.html.
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
  // The only case invisible to the eye: two levels down, the first segment looks
  // like a repository name, and the button aimed at github.com/<owner>/plays.
  atUrl("https://les-troubadours.github.io/plays/ma-piece/dashboard.html");
  assert.equal(
    githubUploadUrl("ma-piece"),
    "https://github.com/les-troubadours/les-troubadours.github.io/upload/main/uploads/ma-piece"
  );
});

test("the upload URL aims at the PLAY's area, the one its button designates", () => {
  // It is the FOLDER that routes the file to its play, never its content: a
  // damaged ZIP must still land in the log of its own play.
  atUrl("https://troupe.github.io/depot/plays/piece/dashboard.html");
  assert.match(githubUploadUrl("piece"), /\/upload\/main\/uploads\/piece$/);
});

test("with no play named, the upload URL aims at the root, the creation channel", () => {
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(githubUploadUrl(), /\/upload\/main\/uploads$/);
});

test("the upload URL names the branch the fork really has", () => {
  // The one thing about this URL that nothing on the site can report. GitHub only
  // serves `/upload/<branch>/<path>` for a branch that EXISTS: given a branch that
  // does not, it drops the upload form AND the path and lands on the repository's
  // home page, so the coordinator sees a plausible GitHub page and no error.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(githubUploadUrl("piece"), /\/upload\/main\//);
});

// --------------------------------------------------------- githubNewPlayUrl

test("creating a play opens GitHub's editor on a file in the upload area", () => {
  // The whole creation gesture is this URL: the file's path and its content travel in
  // it, and the coordinator only has to confirm the commit.
  atUrl("https://les-troubadours.github.io/mon-depot/respo.html");
  assert.equal(
    githubNewPlayUrl("l-ecole-des-femmes", "L'École des femmes", "Commit as is."),
    "https://github.com/les-troubadours/mon-depot/new/main" +
      "?filename=uploads/_new-play/l-ecole-des-femmes.txt" +
      "&value=L'%C3%89cole%20des%20femmes%0A---%0ACommit%20as%20is.%0A"
  );
});

test("the file says the title on its first line, then the note for the human", () => {
  // The Action reads the first line and stops at the separator: the note is there
  // because this box is the only screen of the journey the site does not own, and one
  // bare word in a text box explains nothing.
  atUrl("https://troupe.github.io/depot/respo.html");
  const url = githubNewPlayUrl("antigone", "Antigone", "Ligne une.\nLigne deux.");
  const content = decodeURIComponent(url.match(/&value=(.*)$/)[1]);
  assert.equal(content, "Antigone\n---\nLigne une.\nLigne deux.\n");
  // The datum is the FIRST line, whatever the note holds afterwards.
  assert.equal(content.split("\n")[0], "Antigone");
});

test("the file lands in the creation zone, which is what routes it", () => {
  // The FOLDER is the whole instruction: the Action reads no name and no extension there,
  // which is what keeps the gesture safe on a page where both are editable fields.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(
    githubNewPlayUrl("antigone", "Antigone", "note"),
    /filename=uploads\/_new-play\/antigone\.txt&/
  );
});

test("the creation zone can never be the name of a play", () => {
  // A play's zone is `uploads/<id>/`: if this folder were a valid play id, the Action
  // would take the creation zone for a play of that name, and the other way round.
  atUrl("https://troupe.github.io/depot/respo.html");
  const url = githubNewPlayUrl("antigone", "Antigone", "note");
  const zone = url.match(/filename=uploads\/([^/]+)\//)[1];
  assert.ok(!isPlayId(zone), `"${zone}" is a valid play id`);
});

test("the path keeps its slash literal, so GitHub reads it as a path", () => {
  // Percent-encoded, it is the one thing that could have GitHub take the whole of it
  // for a file NAME, hence a play created at the root of the repo where no Action
  // watches, with nothing to say so.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.ok(!githubNewPlayUrl("antigone", "Antigone", "note").includes("%2F"));
});

test("the file is proposed as .txt, which is a courtesy and not a contract", () => {
  // So that GitHub opens it as text and so that it reads back in the repository. The
  // Action reads no extension in the creation zone, so a coordinator who edits the name
  // before committing breaks nothing: this test guards the courtesy, not the routing.
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
  // Same trap as the upload URL, and the same silence: GitHub serves `/new/<branch>`
  // only for a branch that EXISTS, and otherwise lands on the repository's home page.
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
  // It has NO default value, and that is what made it disappear: the fallback
  // ends up in the file name, so it is interface text, which lives in the
  // catalogues and follows the reader's locale. The play's PDF cannot be called
  // "personnage.pdf" either. The trap is that a title can be non-empty AND leave
  // nothing to the slug ("???" passes a test on the input), so it really is the
  // result that decides the fallback.
  assert.equal(slugify("Transport de Femmes", "script"), "transport-de-femmes");
  assert.equal(slugify("", "script"), "script");
  assert.equal(slugify("???", "script"), "script");
  assert.equal(slugify("   ", "script"), "script");
  // And a play genuinely titled "Personnage" keeps its name: the fallback is not
  // a sentinel value one would recognise afterwards.
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
  // The menu's `<option value>` is this number and it selects the scene: were
  // the kept scenes renumbered 0,1 the reader would land on scene 2 when asking
  // for scene 3.
  const kept = sceneChoices(ACT, "c1");
  assert.equal(kept[1], 2);
});

test("with no character chosen, sceneChoices offers the whole act", () => {
  assert.deepEqual(sceneChoices(ACT, ""), [0, 1, 2]);
});

test("a character silent in the whole act gets the whole act, not an empty menu", () => {
  // A field that opens onto nothing offers no way out of the act it is stuck in.
  assert.deepEqual(sceneChoices(ACT, "ghost"), [0, 1, 2]);
});

test("sceneChoices takes an act with no scene at all", () => {
  assert.deepEqual(sceneChoices([], "c1"), []);
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
  // A speech right at the limit is not marked as cut.
  assert.equal(excerpt("a".repeat(EXCERPT_MAX)), "a".repeat(EXCERPT_MAX));
});
