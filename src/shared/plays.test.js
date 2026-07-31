// The identity of a play: the identifier that names its folder and its address.
//
// This is the only place in the site that MAKES a play identifier, and it does so
// once and for all: a wrong identifier cannot be fixed by a correction, it would
// take renaming a folder of the repository and voiding the links already given to
// the troupe.
import test from "node:test";
import assert from "node:assert/strict";

import { MAX_PLAY_ID_LENGTH, isPlayId, mintPlayId, newPlayScript } from "./plays.js";
import { EMPTY_SCRIPT } from "../editor/reducer.js";

test("an identifier is minted from the title, readable in an address bar", () => {
  assert.equal(mintPlayId("Transport de Femmes"), "transport-de-femmes");
  assert.equal(mintPlayId("Le Malade imaginaire"), "le-malade-imaginaire");
  assert.equal(mintPlayId("  Antigone  "), "antigone");
  // Accents and apostrophes go through the folding of `slugify`.
  assert.equal(mintPlayId("L'École des femmes"), "l-ecole-des-femmes");
});

test("everything mintPlayId returns is accepted by the project's guard", () => {
  // The real contract: what the site makes, the Action must accept. Otherwise the
  // play gets created and all its uploads are refused afterwards.
  for (const title of [
    "Transport de Femmes",
    "L'École des femmes",
    "Ubu roi !",
    "1789",
    "Bérénice",
    "a",
    "x".repeat(200),
    "Fin de partie ---",
  ]) {
    const id = mintPlayId(title);
    assert.ok(isPlayId(id), `"${title}" gave "${id}"`);
  }
});

test("an over-long title is truncated without leaving a trailing hyphen", () => {
  // The truncation can fall right on a hyphen, which the pattern refuses at the
  // end of the string just as much as at the start.
  const id = mintPlayId("un titre interminable ".repeat(10));
  assert.equal(id.length <= MAX_PLAY_ID_LENGTH, true);
  assert.ok(!id.endsWith("-"), id);
  assert.ok(isPlayId(id));
});

test("a title that leaves nothing returns an empty string, never an invented name", () => {
  // The caller then asks for another title: a folder named "piece-1" would mean
  // nothing to anyone, and it would live for years in the troupe's URL.
  for (const title of ["", "   ", "???", "!!!", "---", null, undefined, 42]) {
    assert.equal(mintPlayId(title), "");
  }
});

test("the created play has exactly the fields of an editor play", () => {
  // Mirror of EMPTY_SCRIPT: a field added to the play must arrive in both,
  // otherwise a fresh play would be born without it and the editor would fill it
  // in silently.
  const fresh = newPlayScript("antigone", "Antigone", "fr");
  assert.deepEqual(Object.keys(fresh).sort(), Object.keys(EMPTY_SCRIPT).sort());
});

test("the created play carries its identifier, its title and its language", () => {
  const fresh = newPlayScript("antigone", "Antigone", "en");
  assert.equal(fresh.id, "antigone");
  assert.equal(fresh.title, "Antigone");
  assert.equal(fresh.language, "en");
});

test("the created play carries a scene to write in, like the editor's floor", () => {
  // Without it, the first opening of the Editing page would have no scene to
  // display (Python, for its part, never invents an act the file does not carry).
  const fresh = newPlayScript("antigone", "Antigone", "fr");
  assert.deepEqual(fresh.acts, [{ scenes: [{ lines: [] }] }]);
  assert.deepEqual(fresh.characters, []);
});
