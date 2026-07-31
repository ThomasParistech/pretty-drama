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
  githubPlayFolderUrl,
  githubUploadUrl,
  myLineNumbers,
  slugify,
} from "./data.js";

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

test("both GitHub URLs name the branch the fork really has", () => {
  // The one thing about these URLs that nothing on the site can report. GitHub only
  // serves `/upload/<branch>/<path>` for a branch that EXISTS: given a branch that
  // does not, it drops the upload form AND the path and lands on the repository's
  // home page, so the coordinator sees a plausible GitHub page and no error. The
  // `/tree/` view, on the other hand, aliases `master` to the default branch, which
  // is what let the wrong branch survive unnoticed: the folder link kept working.
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.match(githubUploadUrl("piece"), /\/upload\/main\//);
  assert.match(githubPlayFolderUrl("piece"), /\/tree\/main\//);
});

test("a play's folder on GitHub, for the only gesture the site does not carry", () => {
  atUrl("https://troupe.github.io/depot/respo.html");
  assert.equal(
    githubPlayFolderUrl("ma-piece"),
    "https://github.com/troupe/depot/tree/main/plays/ma-piece"
  );
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
