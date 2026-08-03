// The site only ANNOUNCES a play id; `mint_play_id` (scripts/common.py) decides it.
// Tested here: the two agree. A wrong id cannot be corrected, only renamed, voiding
// every link already handed to the troupe.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DEV_PLAY_ID, MAX_PLAY_ID_LENGTH, isPlayId, mintPlayId } from "./plays.ts";

// Shared table, read here and by scripts/tests/test_contracts.py: a case is added once
// and checked on both sides. `new URL` because `import.meta.dirname` needs Node 20.11.
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
  // Otherwise the play gets created and all its uploads are refused afterwards.
  for (const { name, title } of CASES) {
    const id = mintPlayId(title);
    if (id === "") continue; // refused before anything is downloaded
    assert.ok(isPlayId(id), `${name}: "${title}" gave "${id}"`);
    assert.ok(id.length <= MAX_PLAY_ID_LENGTH, `${name}: ${id.length} characters`);
  }
});

test("the test bench holds a real address, which is why no title may mint it", () => {
  assert.ok(isPlayId(DEV_PLAY_ID));
  assert.equal(mintPlayId("Dev"), DEV_PLAY_ID);
});

test("a title that leaves nothing returns an empty string, never an invented name", () => {
  for (const title of ["", "   ", "???", "!!!", "---", null, undefined, 42]) {
    assert.equal(mintPlayId(title), "");
  }
});
