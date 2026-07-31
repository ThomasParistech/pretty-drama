// The identity of a play: the identifier that names its folder and its address.
//
// The site does not MINT it any more, the Action does (`mint_play_id`,
// scripts/common.py): creating a play uploads its title and nothing else. What is
// tested here is the announcement the management page makes of that address before the
// upload, and the contract is that the two agree, because a wrong identifier cannot be
// fixed by a correction: it would take renaming a folder of the repository and voiding
// the links already handed to the troupe.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MAX_PLAY_ID_LENGTH, isPlayId, mintPlayId } from "./plays.js";

// The shared table, read by this file and by scripts/tests/test_contracts.py: it is
// the CONTRACT between the two implementations, so a case is added once and checked on
// both sides. `new URL` rather than `import.meta.dirname`, which Node only grew in
// 20.11, and a plain read rather than an import attribute, whose syntax is still
// moving.
const CASES = JSON.parse(
  readFileSync(new URL("../../scripts/tests/play-id-cases.json", import.meta.url), "utf8")
);

test("the announced identifier is the one the Action will mint", () => {
  assert.ok(CASES.length > 5, "the shared table was not read");
  for (const { name, title, id } of CASES) {
    assert.equal(mintPlayId(title), id, name);
  }
});

test("everything mintPlayId returns is accepted by the project's guard", () => {
  // The real contract on this side: what the site announces, the Action must accept.
  // Otherwise the play gets created and all its uploads are refused afterwards.
  for (const { name, title } of CASES) {
    const id = mintPlayId(title);
    if (id === "") continue; // refused before anything is downloaded
    assert.ok(isPlayId(id), `${name}: "${title}" gave "${id}"`);
    assert.ok(id.length <= MAX_PLAY_ID_LENGTH, `${name}: ${id.length} characters`);
  }
});

test("a title that leaves nothing returns an empty string, never an invented name", () => {
  // The page then asks for another title: a folder named "piece-1" would mean nothing
  // to anyone, and it would live for years in the troupe's URL. The non-string cases
  // are this side's own: they cannot reach the Action, which only ever reads text.
  for (const title of ["", "   ", "???", "!!!", "---", null, undefined, 42]) {
    assert.equal(mintPlayId(title), "");
  }
});
