// Contrat ZIP, côté navigateur : l'extension du membre audio.
//
// L'Action retrouve l'audio d'une réplique en cherchant un membre nommé
// `{lineId}.{ext}`, avec `ext` validé par la regex `[0-9a-zA-Z]+` de
// `parse_manifest` (scripts/process_uploads.py). Une extension qui sortirait
// de cet alphabet (un `audio/webm;codecs=opus` recopié tel quel, un point, un
// tiret) rendrait le clip introuvable : le ZIP entier serait refusé, et le
// respo lirait « fichier audio introuvable » sans savoir pourquoi.
import test from "node:test";
import assert from "node:assert/strict";

import { extensionForMimeType } from "./useRecorder.js";

// Le miroir exact de LINE_ID_PATTERN côté extension, dans process_uploads.py :
//   re.fullmatch(re.escape(line_id) + r"\.[0-9a-zA-Z]+", n)
const ACCEPTED_BY_THE_ACTION = /^[0-9a-zA-Z]+$/;

// Ce que les navigateurs rendent réellement dans MediaRecorder.mimeType, plus
// les valeurs limites.
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

test("toute extension produite est acceptée par l'Action", () => {
  for (const mimeType of MIME_TYPES) {
    const ext = extensionForMimeType(mimeType);
    assert.match(ext, ACCEPTED_BY_THE_ACTION, `type MIME : ${JSON.stringify(mimeType)}`);
  }
});

test("les conteneurs connus gardent leur extension d'usage", () => {
  assert.equal(extensionForMimeType("audio/webm;codecs=opus"), "webm");
  assert.equal(extensionForMimeType("audio/mp4"), "mp4");
  assert.equal(extensionForMimeType("audio/ogg;codecs=opus"), "ogg");
});

test("un type MIME absent ou inconnu retombe sur une extension, jamais sur rien", () => {
  // ffmpeg lit le conteneur réel, pas l'extension : se tromper de nom coûte
  // moins cher que d'écrire un membre sans extension, que l'Action ne
  // retrouverait pas.
  for (const mimeType of ["", null, undefined, "audio/x-inconnu"]) {
    assert.equal(extensionForMimeType(mimeType), "webm");
  }
});
