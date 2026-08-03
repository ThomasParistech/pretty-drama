// ZIP contract: the Action looks for `{lineId}.{ext}` with `ext` matched by `[0-9a-zA-Z]+`
// (`parse_manifest`, process_uploads.py). Outside that alphabet the whole ZIP is refused.
import test from "node:test";
import assert from "node:assert/strict";

import { extensionForMimeType } from "./useRecorder.ts";

// Mirrors process_uploads.py: re.fullmatch(re.escape(line_id) + r"\.[0-9a-zA-Z]+", n)
const ACCEPTED_BY_THE_ACTION = /^[0-9a-zA-Z]+$/;

// What browsers really return in MediaRecorder.mimeType, plus the boundary values.
const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/ogg;codecs=opus",
  "audio/aac",
  "audio/x-inconnu",
  "",
  null,
  undefined,
];

test("every extension produced is accepted by the Action", () => {
  for (const mimeType of MIME_TYPES) {
    const ext = extensionForMimeType(mimeType);
    assert.match(ext, ACCEPTED_BY_THE_ACTION, `MIME type: ${JSON.stringify(mimeType)}`);
  }
});

test("known containers keep their customary extension", () => {
  assert.equal(extensionForMimeType("audio/webm;codecs=opus"), "webm");
  assert.equal(extensionForMimeType("audio/mp4"), "mp4");
  assert.equal(extensionForMimeType("audio/ogg;codecs=opus"), "ogg");
});

test("a missing or unknown MIME type falls back to an extension, never to nothing", () => {
  // ffmpeg reads the real container, so a wrong name costs less than no extension at all.
  for (const mimeType of ["", null, undefined, "audio/x-inconnu"]) {
    assert.equal(extensionForMimeType(mimeType), "webm");
  }
});
