// The repair of a dubious script.json and the reducer cases carrying an invariant:
// a recycled line id, a line silently changing character, a rejected action that
// pushes an undo step anyway.
import test from "node:test";
import assert from "node:assert/strict";

import { CHARACTER_COLORS, assignColors, isPaletteColor } from "../shared/characterColors.ts";
import {
  EMPTY_SCRIPT,
  SAFE_ID,
  allLines,
  indexAfterMove,
  indexAfterRemoval,
  sanitizeScript,
  scriptReducer,
} from "./reducer.ts";
import type { ScriptAction } from "./reducer.ts";
import type { Line, Script } from "../shared/types.ts";

// `overrides` is deliberately loose and the result is cast: half this file feeds
// `sanitizeScript`, whose whole job is a hand-edited script.json, so the fixtures
// carry an id that is a number and a line that is null ON PURPOSE.
const play = (overrides: Record<string, unknown> = {}): Script =>
  ({
  id: "le-misanthrope",
  language: "fr",
  title: "Le Misanthrope",
  characters: [
    { id: "c-alceste", name: "Alceste", color: CHARACTER_COLORS[0] },
    { id: "c-philinte", name: "Philinte", color: CHARACTER_COLORS[1] },
  ],
  acts: [
    {
      scenes: [
        {
          lines: [
            { id: "l-1", characterId: "c-alceste", text: "Laissez-moi." },
            { id: "l-2", characterId: "c-philinte", text: "Qu'est-ce donc ?" },
          ],
        },
      ],
    },
  ],
    ...overrides,
  }) as Script;

// TWO acts: SET_LINE_TEXTS is the only "lines" case crossing the whole play.
const twoActs = () =>
  play({
    acts: [
      play().acts[0]!,
      {
        scenes: [
          {
            lines: [{ id: "l-3", characterId: "c-philinte", text: "Encore vous ?" }],
          },
        ],
      },
    ],
  });

const firstScene = (script: Script) => script.acts[0]!.scenes[0]!;
const lineIds = (script: Script) => allLines(script).map((l) => l.id);
const ownerOf = (script: Script, lineId: string) => {
  const line = allLines(script).find((l) => l.id === lineId);
  return script.characters.find((c) => c.id === line?.characterId)?.name ?? null;
};

// ---------------------------------------------------------------- sanitize

test("sanitizeScript returns a valid script unchanged in substance", () => {
  const sane = sanitizeScript(play());
  assert.equal(sane.title, "Le Misanthrope");
  assert.deepEqual(lineIds(sane), ["l-1", "l-2"]);
  assert.deepEqual(
    sane.characters.map((c) => c.id),
    ["c-alceste", "c-philinte"]
  );
});

test("sanitizeScript accepts any root without throwing", () => {
  for (const raw of [null, undefined, 42, "texte", [1, 2, 3], {}]) {
    const sane = sanitizeScript(raw);
    assert.equal(typeof sane.title, "string");
    assert.deepEqual(sane.characters, []);
    // Always one act and one scene: somewhere to write the first line.
    assert.ok(sane.acts.length >= 1);
    assert.ok(sane.acts[0]!.scenes.length >= 1);
  }
});

test("every line id returned satisfies SAFE_ID, so it names an mp3 safely", () => {
  const sane = sanitizeScript(
    play({
      acts: [
        {
          scenes: [
            {
              lines: [
                { id: "../evil", characterId: "c-alceste", text: "a" },
                { id: "avec espace", characterId: "c-alceste", text: "b" },
                { id: "abc\n", characterId: "c-alceste", text: "c" },
                { id: "x".repeat(65), characterId: "c-alceste", text: "d" },
                { id: 7, characterId: "c-alceste", text: "e" },
                { id: "l-legitime", characterId: "c-alceste", text: "f" },
              ],
            },
          ],
        },
      ],
    })
  );
  const ids = lineIds(sane);
  assert.equal(ids.length, 6);
  for (const id of ids) assert.match(id, SAFE_ID);
  // A valid id is never replaced: it may already name a published clip.
  assert.ok(ids.includes("l-legitime"));
});

test("a duplicated line id is re-minted, never recycled", () => {
  const sane = sanitizeScript(
    play({
      acts: [
        {
          scenes: [
            {
              lines: [
                { id: "l-1", characterId: "c-alceste", text: "premier" },
                { id: "l-1", characterId: "c-philinte", text: "second" },
              ],
            },
          ],
        },
      ],
    })
  );
  const [a, b] = firstScene(sane).lines;
  assert.equal(a.id, "l-1", "the first holder keeps its id (its clip may exist)");
  assert.notEqual(b.id, "l-1");
  assert.match(b.id, SAFE_ID);
  assert.equal(new Set(lineIds(sane)).size, 2);
});

test("a character whose id fails SAFE_ID is re-minted AND its lines follow it", () => {
  // Otherwise one accented letter in a hand-edited file orphans a whole role.
  const sane = sanitizeScript({
    characters: [{ id: "éliante", name: "Éliante" }],
    acts: [{ scenes: [{ lines: [{ id: "l-1", characterId: "éliante", text: "Bonjour." }] }] }],
  });
  assert.equal(ownerOf(sane, "l-1"), "Éliante");
  assert.match(sane.characters[0].id, SAFE_ID);
});

test("two characters with the SAME id: the first keeps the id and its lines", () => {
  // The second leaves with a fresh id and NO lines: moving them would change who
  // speaks, while the mp3s, named by line id, would not follow.
  const sane = sanitizeScript({
    characters: [{ id: "c1", name: "Alceste" }, { id: "c1", name: "Philinte" }],
    acts: [{ scenes: [{ lines: [{ id: "l-1", characterId: "c1", text: "Laissez-moi." }] }] }],
  });
  assert.equal(sane.characters[0].id, "c1");
  assert.notEqual(sane.characters[1].id, "c1");
  assert.equal(ownerOf(sane, "l-1"), "Alceste");
});

test("a line naming a character that does not exist becomes orphaned, not an error", () => {
  const sane = sanitizeScript(
    play({
      acts: [{ scenes: [{ lines: [{ id: "l-1", characterId: "c-fantome", text: "?" }] }] }],
    })
  );
  assert.equal(firstScene(sane).lines[0].characterId, null);
});

test("malformed entries are dropped, never a crash", () => {
  const sane = sanitizeScript({
    characters: [
      { id: "c-ok", name: "Alceste" },
      { id: "c-vide", name: "   " }, // blank name: not a character
      { id: "c-sans-nom" },
      null,
      "Philinte",
    ],
    acts: [
      null,
      { scenes: [null, { lines: [null, 42, { id: "l-1", text: "seule valide" }] }] },
    ],
  });
  assert.deepEqual(
    sane.characters.map((c) => c.name),
    ["Alceste"]
  );
  assert.deepEqual(lineIds(sane), ["l-1"]);
  assert.equal(allLines(sane)[0].text, "seule valide");
});

test("a missing or foreign colour is repaired with a colour from the palette", () => {
  const sane = sanitizeScript({
    characters: [
      { id: "c1", name: "A" },
      { id: "c2", name: "B", color: 999 },
      { id: "c3", name: "C", color: "bleu" },
      // A duplicate colour too: two identical ones are indistinguishable in the
      // Speaking share charts.
      { id: "c4", name: "D", color: CHARACTER_COLORS[0] },
    ],
    acts: [],
  });
  for (const c of sane.characters) assert.ok(isPaletteColor(c.color), `colour: ${c.color}`);
  // Deterministic and duplicate-free until the palette is exhausted.
  assert.equal(new Set(sane.characters.map((c) => c.color)).size, 4);
});

test("Editing and Speaking share fill in colours identically", () => {
  // THE contract with characterColors.ts: a script with no colours is filled in by
  // `sanitizeScript` here and by `assignColors` on the manifest side, and a drift
  // shows two different casts of one play.
  const characters = [
    { id: "c-alceste", name: "Alceste" },
    { id: "c-philinte", name: "Philinte" },
    { id: "c-oronte", name: "Oronte" },
    // Respected on both sides, even when the fill-in would have chosen otherwise.
    { id: "c-celimene", name: "Célimène", color: CHARACTER_COLORS[7] },
  ];
  const edition = sanitizeScript({ characters, acts: [] }).characters;
  const repartition = assignColors(characters);
  assert.deepEqual(
    edition.map((c) => [c.id, c.color]),
    [...repartition],
    "same id, same colour, in the same order"
  );

  // Past the palette the two count served characters differently (a counter here, a
  // Map's size there), the only place that count decides the colour.
  const troupe = Array.from({ length: 23 }, (_, i) => ({ id: `c${i}`, name: `Personnage ${i}` }));
  assert.deepEqual(
    sanitizeScript({ characters: troupe, acts: [] }).characters.map((c) => c.color),
    [...assignColors(troupe).values()],
    "the palette wraps at the same pace on both sides"
  );
});

test("a missing text becomes an empty string, never undefined", () => {
  const sane = sanitizeScript({
    characters: [],
    acts: [{ scenes: [{ lines: [{ id: "l-1" }, { id: "l-2", text: 42 }] }] }],
  });
  for (const line of allLines(sane)) assert.equal(line.text, "");
});

// ----------------------------------------------------------------- reducer

test("moving a line keeps its id (its mp3 stays its own)", () => {
  const before = play();
  const after = scriptReducer(before, {
    type: "MOVE_LINE",
    actIndex: 0,
    sceneIndex: 0,
    activeId: "l-1",
    overId: "l-2",
  });
  assert.deepEqual(lineIds(after), ["l-2", "l-1"]);
});

test("renaming a character touches no line id", () => {
  const before = play();
  const after = scriptReducer(before, {
    type: "RENAME_CHARACTER",
    id: "c-alceste",
    name: "ALCESTE",
  });
  assert.deepEqual(lineIds(after), lineIds(before));
  assert.equal(ownerOf(after, "l-1"), "ALCESTE");
});

test("editing a text does not touch the line's id", () => {
  const after = scriptReducer(play(), {
    type: "EDIT_TEXT",
    actIndex: 0,
    sceneIndex: 0,
    lineId: "l-1",
    text: "Tout autre chose.",
  });
  assert.deepEqual(lineIds(after), ["l-1", "l-2"]);
  assert.equal(allLines(after)[0].text, "Tout autre chose.");
});

test("a new line takes on the character of the one it follows", () => {
  const after = scriptReducer(play(), {
    type: "ADD_LINE",
    id: "l-3",
    actIndex: 0,
    sceneIndex: 0,
    afterLineId: "l-1",
  });
  assert.deepEqual(lineIds(after), ["l-1", "l-3", "l-2"]);
  assert.equal(ownerOf(after, "l-3"), "Alceste");
});

test("deleting a character: reassigning moves its lines, without changing their ids", () => {
  const after = scriptReducer(play(), {
    type: "DELETE_CHARACTER",
    id: "c-alceste",
    mode: "reassign",
    reassignTo: "c-philinte",
  });
  assert.deepEqual(lineIds(after), ["l-1", "l-2"]);
  assert.equal(ownerOf(after, "l-1"), "Philinte");
  assert.equal(after.characters.length, 1);
});

test("deleting a character: the other mode takes its lines away with it", () => {
  const after = scriptReducer(play(), {
    type: "DELETE_CHARACTER",
    id: "c-alceste",
    mode: "deleteLines",
  });
  assert.deepEqual(lineIds(after), ["l-2"]);
});

test("a rejected action returns the EXACT state it was given, not a copy", () => {
  // history.ts pushes by identity: a copy births empty steps and lights the label.
  const before = play();
  const edit = (edits: unknown) => ({ type: "SET_LINE_TEXTS", edits });
  const retype = (lineId: string, text: string) => ({
    type: "EDIT_TEXT",
    actIndex: 0,
    sceneIndex: 0,
    lineId,
    text,
  });
  for (const [i, action] of [
    { type: "ADD_CHARACTER", id: "c-neuf", name: "   " },
    { type: "RENAME_CHARACTER", id: "c-alceste", name: "  " },
    { type: "ACTION_INCONNUE" },
    { type: "MOVE_LINE", actIndex: 0, sceneIndex: 0, activeId: "l-1", overId: "l-1" },
    // No effect: empty batch, unknown line, text already in place, malformed batch.
    edit([]),
    edit([{ lineId: "l-inconnue", text: "Ailleurs." }]),
    edit([{ lineId: "l-1", text: "Laissez-moi." }]),
    edit("pas un tableau"),
    edit([null, { lineId: "l-1" }, { text: "sans id" }]),
    // And a keystroke putting the current text back.
    retype("l-1", "Laissez-moi."),
    retype("l-inconnue", "Ailleurs."),
  ].entries()) {
    // Cast on purpose: an unknown type and a malformed batch are outside ScriptAction,
    // and the point of the test is that the reducer still returns the SAME state.
    assert.equal(scriptReducer(before, action as ScriptAction), before, `action ${i}: ${action.type}`);
  }
});

test("SET_LINE_TEXTS rewrites several lines from several acts in a single state", () => {
  const before = twoActs();
  const after = scriptReducer(before, {
    type: "SET_LINE_TEXTS",
    edits: [
      { lineId: "l-1", text: "Laissez-nous." },
      { lineId: "l-3", text: "Encore nous ?" },
    ],
  });
  // The ids do not move: they name the mp3s already recorded.
  assert.deepEqual(lineIds(after), ["l-1", "l-2", "l-3"]);
  assert.deepEqual(
    allLines(after).map((l) => l.text),
    ["Laissez-nous.", "Qu'est-ce donc ?", "Encore nous ?"]
  );
});

test("SET_LINE_TEXTS keeps the identity of what it does not touch", () => {
  // What lets React.memo skip the rest: act II's replacement must not re-render I.
  const before = twoActs();
  const after = scriptReducer(before, {
    type: "SET_LINE_TEXTS",
    edits: [{ lineId: "l-3", text: "Encore nous ?" }],
  });
  assert.notEqual(after, before);
  assert.equal(after.acts[0], before.acts[0], "the untouched act keeps its object");
  assert.equal(
    firstScene(after).lines[1],
    firstScene(before).lines[1],
    "the untouched line keeps its object"
  );
});

test("a new character receives a free colour from the palette", () => {
  const after = scriptReducer(play(), { type: "ADD_CHARACTER", id: "c-oronte", name: "Oronte" });
  const oronte = after.characters.find((c) => c.id === "c-oronte");
  assert.ok(isPaletteColor(oronte!.color));
  assert.equal(new Set(after.characters.map((c) => c.color)).size, 3);
});

test("SET_CHARACTER_COLOR rejects a colour outside the palette, without making a state", () => {
  // A rejected action pushes nothing: the reducer returns the state it was GIVEN.
  const before = play();
  const same = scriptReducer(before, {
    type: "SET_CHARACTER_COLOR",
    id: "c-alceste",
    color: "chartreuse",
  });
  assert.equal(same, before, "state returned identically");
  const after = scriptReducer(before, {
    type: "SET_CHARACTER_COLOR",
    id: "c-alceste",
    color: CHARACTER_COLORS[5],
  });
  assert.equal(after.characters[0].color, CHARACTER_COLORS[5]);
});

test("putting the title or the language back identically makes no state", () => {
  // The no-op invariant on the two SCALAR fields. It happens for real: pasting the
  // same title fires the event with an unchanged value.
  const before = play();
  assert.equal(
    scriptReducer(before, { type: "SET_TITLE", title: before.title }),
    before,
    "identical title: state returned identically"
  );
  assert.equal(
    scriptReducer(before, { type: "SET_LANGUAGE", language: before.language }),
    before,
    "identical language: state returned identically"
  );
  // The guard must not swallow a real change, wiping the title included.
  assert.equal(scriptReducer(before, { type: "SET_TITLE", title: "" }).title, "");
  assert.notEqual(scriptReducer(before, { type: "SET_TITLE", title: "Autre" }), before);
});

// ---- Reshaping the outline (the rail's "Structure" section) ----

test("MOVE_ACT reorders the acts and the lines follow their scene", () => {
  const before = twoActs();
  const after = scriptReducer(before, { type: "MOVE_ACT", from: 1, to: 0 });
  // By object IDENTITY: it proves the same acts crossed, not two rebuilt ones.
  assert.equal(after.acts.length, 2);
  assert.equal(after.acts[0], before.acts[1], "the moved act keeps its object");
  assert.equal(after.acts[1], before.acts[0], "and so does the one it overtakes");
  // The ids name the mp3s: reordering must never re-mint one.
  assert.deepEqual(lineIds(after).sort(), lineIds(before).sort());
});

test("MOVE_SCENE reorders within its act and leaves the others intact", () => {
  const before = scriptReducer(twoActs(), { type: "ADD_SCENE", actIndex: 0 });
  const after = scriptReducer(before, { type: "MOVE_SCENE", actIndex: 0, from: 1, to: 0 });
  // By object IDENTITY: it proves the same scenes moved, not two equal rebuilds.
  assert.equal(after.acts[0].scenes.length, 2);
  assert.equal(after.acts[0].scenes[0], before.acts[0].scenes[1], "the second moved ahead");
  assert.equal(after.acts[0].scenes[1], before.acts[0].scenes[0], "and the first behind");
  assert.equal(after.acts[1], before.acts[1], "the untouched act keeps its object");
});

test("a move with no effect returns the EXACT state it was given", () => {
  // Otherwise a scene dropped back where it was lights the label and leaves an empty
  // step to undo (the no-op invariant).
  const before = twoActs();
  for (const action of [
    { type: "MOVE_ACT", from: 1, to: 1 },
    { type: "MOVE_ACT", from: 0, to: 7 },
    { type: "MOVE_ACT", from: -1, to: 0 },
    { type: "MOVE_SCENE", actIndex: 0, from: 0, to: 0 },
    { type: "MOVE_SCENE", actIndex: 0, from: 0, to: 3 },
    { type: "MOVE_SCENE", actIndex: 9, from: 0, to: 0 },
  ]) {
    assert.equal(scriptReducer(before, action as ScriptAction), before, JSON.stringify(action));
  }
});

test("indexAfterMove makes the displayed scene follow along", () => {
  // What we are looking at is what moves: it follows.
  assert.equal(indexAfterMove(2, 2, 0), 0);
  // A neighbour crossing shifts us one notch the other way.
  assert.equal(indexAfterMove(0, 2, 0), 1);
  assert.equal(indexAfterMove(1, 0, 2), 0);
  // A crossing that does not pass us changes nothing.
  assert.equal(indexAfterMove(0, 1, 2), 0);
  assert.equal(indexAfterMove(3, 0, 1), 3);
});

test("indexAfterRemoval steps back onto what precedes when the watched scene goes", () => {
  assert.equal(indexAfterRemoval(2, 2), 1);
  // Nothing before the first, so we stay at rank 0, now the next one's.
  assert.equal(indexAfterRemoval(0, 0), 0);
  // A deletion before us steps our rank back; after us, nothing.
  assert.equal(indexAfterRemoval(2, 0), 1);
  assert.equal(indexAfterRemoval(1, 3), 1);
});

test("EMPTY_SCRIPT is a script sanitizeScript accepts as is", () => {
  assert.deepEqual(sanitizeScript(EMPTY_SCRIPT), {
    ...EMPTY_SCRIPT,
    characters: [],
  });
});

test("the play's identifier is copied over, never re-minted", () => {
  // Unlike the ids above: this one names a folder and a URL, so a fresh one would
  // send the next download to a play that does not exist.
  assert.equal(sanitizeScript({ id: "transport-de-femmes", acts: [] }).id, "transport-de-femmes");
});

test("a malformed play identifier becomes empty rather than a path", () => {
  // It ends up in a path and a URL, validated as on the Action side, which refuses
  // to promote rather than guess a destination.
  for (const bad of ["../evil", "Majuscule", "avec espace", "-tiret", "x".repeat(65), 42, null]) {
    assert.equal(sanitizeScript({ id: bad, acts: [] }).id, "", String(bad));
  }
  assert.equal(sanitizeScript({ acts: [] }).id, "");
});

test("the play's identifier enters the compared fields by itself", () => {
  // history.ts derives SCRIPT_FIELDS from `Object.keys(EMPTY_SCRIPT)`, so a new field
  // joins the identity comparison with no list to maintain.
  assert.ok(Object.keys(EMPTY_SCRIPT).includes("id"));
});
