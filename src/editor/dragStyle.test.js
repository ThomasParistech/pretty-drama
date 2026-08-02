// This replaced `CSS.Transform.toString` (@dnd-kit/utilities), so what is pinned here
// is exactly what that helper wrote for the editor's three vertical lists: the same
// string, rounded, and nothing at all when there is no transform.
import test from "node:test";
import assert from "node:assert/strict";

import { dragStyle } from "./dragStyle.js";

test("a moving row is translated on both axes, in whole pixels", () => {
  const style = dragStyle({ x: 0, y: 12.4, scaleX: 1, scaleY: 1 }, "transform 200ms", true);
  assert.equal(style.transform, "translate3d(0px, 12px, 0)");
  assert.equal(style.transition, "transform 200ms");
  assert.equal(style.opacity, 0.6);
});

test("a row at rest carries no transform at all", () => {
  // `undefined` and not "none": React then writes no declaration, as dnd-kit did.
  const style = dragStyle(null, undefined, false);
  assert.equal(style.transform, undefined);
  assert.equal(style.opacity, 1);
});

test("a missing or unusable offset becomes a zero, never a NaN", () => {
  // One NaN in the string voids the whole declaration and the row stops following.
  assert.equal(dragStyle({}, null, false).transform, "translate3d(0px, 0px, 0)");
  assert.equal(
    dragStyle({ x: Number.NaN, y: -3.6 }, null, false).transform,
    "translate3d(0px, -4px, 0)"
  );
});
