// The ZIP contract, browser side: the extension of the audio member.
//
// The Action finds a line's audio by looking for a member named
// `{lineId}.{ext}`, with `ext` validated by the `[0-9a-zA-Z]+` regex of
// `parse_manifest` (scripts/process_uploads.py). An extension that fell outside
// that alphabet (an `audio/webm;codecs=opus` copied verbatim, a dot, a hyphen)
// would make the clip impossible to find: the whole ZIP would be refused, and
// the coordinator would read "audio file not found" without knowing why.
import test from "node:test";
import assert from "node:assert/strict";

import { extensionForMimeType } from "./useRecorder.js";

// The exact mirror of LINE_ID_PATTERN on the extension side, in process_uploads.py:
//   re.fullmatch(re.escape(line_id) + r"\.[0-9a-zA-Z]+", n)
const ACCEPTED_BY_THE_ACTION = /^[0-9a-zA-Z]+$/;

// What browsers actually return in MediaRecorder.mimeType, plus the boundary
// values.
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
  // ffmpeg reads the real container, not the extension: getting the name wrong
  // costs less than writing a member with no extension, which the Action would
  // not find.
  for (const mimeType of ["", null, undefined, "audio/x-inconnu"]) {
    assert.equal(extensionForMimeType(mimeType), "webm");
  }
});
