import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import CountBadge from "./CountBadge.jsx";
import { FlagIcon } from "../shared/icons.jsx";
import { LOCALES } from "../shared/i18n.js";
import { fmt, t, translator } from "../shared/locale.js";
import { actLabel, sceneLabel } from "../shared/structureLabels.js";

// The play's plan: its title, its acts, its scenes. It is at once the editor's
// NAVIGATION (one scene at a time, as before) and the only place where the
// structure is shaped (add, delete, reorder).
//
// It used to live in the shared header, as two `<select>` plus two "+ Scene" /
// "+ Act" buttons, and it is the move of the character chips that plays out again
// here, for the same reason: on Rehearsal and Recording one CHOOSES a scene inside
// frozen content, in Editing one SHAPES it, and the header is shared by five pages.
// The structure was moreover scattered across three places (the selects and the two
// buttons in the header, the act's deletion in the column, the scene's in
// SceneEditor), while none of them showed the shape of the play: two dropdown lists
// only display one line at a time.
//
// **Only the PLAY has a name.** Acts and scenes are not renamed at all: their
// label is derived from their rank ("Acte I", "Scène 3", see structureLabels.js).
// So this panel holds one text field, the play's title, plus its language.
//
// Renaming acts and scenes did exist here, as plain always-visible fields, and
// dropping it is what dissolved a whole problem rather than solving it. A stored
// title is DATA in one language, and it travelled: to manifest.json, to the
// printed PDF, to the Progress column headers, to the Speaking share scope. None
// of those could translate it, and none of them should have had to, because the
// real play never used the freedom anyway (ten scenes, all of them "Scène N").
// Deriving the label makes it ordinary text again, and this panel composes it in
// the language of the PLAY, the one declared two rows above the plan: an act
// heading here is the document's, not the reader's navigation, and it is word for
// word what the printed PDF will carry (see structureLabels.js).
//
// What that costs, and it is the only thing: an act cannot be called "Prologue".
// If it ever needs to be, that is an optional field to add back, not a redesign.
//
// **A scene is still the one thing in the plan you NAVIGATE to, so it is a
// button.** It used to be a text field, and the keyboard path to opening a scene
// came along for free: tab reached the field, and focusing it opened the scene.
// With nothing left to type, a static label would have taken that path away, so
// the name is a real button instead, reachable by tab and activated by Enter or
// Space. An act name, by contrast, leads nowhere (its scenes are listed right
// below, and that is where one chooses), so it is plain text.
//
// The row around a scene stays clickable as a mouse convenience, and the ✕ still
// stops propagation: deleting a scene is not a way of going to it.
export default function StructurePanel({
  script,
  actIndex,
  sceneIndex,
  dispatch,
  onGo,
  onAddAct,
  onAddScene,
  onDeleteAct,
  onDeleteScene,
  onMoveAct,
  onMoveScene,
}) {
  // Deletion awaiting confirmation, acts and scenes alike: one single state and one
  // single modal, the question being the same but for the object. Nothing to ask
  // when the object is empty, as everywhere else in the editor.
  const [pending, setPending] = useState(null);

  // The "Play language" label names the group of flags, which is not a `<label>` (a
  // group of radio buttons is not associated with one field but with several): an id
  // is therefore needed, and `useId` avoids hardcoding one in a component nothing
  // forbids mounting twice.
  const languageLabelId = useId();

  // The translator for the plan's labels, bound to the language of the PLAY and not
  // to the reader's (see structureLabels.js). It goes down as a prop into the rows:
  // two components cannot read the language each on their own without the text
  // column and the plan ending up out of step.
  // It changes the second one clicks a flag just above, which is also what makes the
  // setting legible: one sees the plan go from "Acte I" to "Act I", so one sees what
  // the play's language commands.
  const tPlay = translator(script.language);

  // Bring the open scene into view WHEN THE SECTION OPENS, and only then: the plan
  // of a five-act play is taller than the panel, so reopening "Structure" from a
  // late scene showed the beginning of the play and required scrolling down to find
  // where one is. `nearest` does nothing when the row is already visible, and since
  // the panel is only mounted while the section is open, a mount effect is enough
  // (no dependencies: navigating from here has no business moving the list under the
  // cursor).
  const currentRow = useRef(null);
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const sensors = useSensors(
    // Same activation distance as the lines: a simple click on a scene must go to
    // it, not start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // One pass over the play rather than a sum per act on every row render.
  const actCounts = useMemo(
    () => script.acts.map((a) => a.scenes.reduce((n, s) => n + s.lines.length, 0)),
    [script.acts]
  );

  // Acts and scenes have no id: the dnd-kit identity is the rank, prefixed by the
  // type (`act:2`, `scene:2:0`). Stable for the duration of a drag, which changes
  // nothing before it ends, and it is also what MOVE_ACT / MOVE_SCENE expect. The
  // React keys are ranks for the same reason, so nothing re-animates after a move.
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = String(active.id).split(":");
    const to = String(over.id).split(":");
    if (from[0] === "act" && to[0] === "act") {
      onMoveAct(Number(from[1]), Number(to[1]));
    } else if (from[0] === "scene" && to[0] === "scene" && from[1] === to[1]) {
      onMoveScene(Number(from[1]), Number(from[2]), Number(to[2]));
    }
  };

  // An act is not dropped onto a scene, and a scene does not leave its act (see
  // MOVE_SCENE in reducer.js). The filtering is done HERE, at collision detection,
  // and not only as a guard on arrival: the two nested `SortableContext` live inside
  // a single `DndContext`, so without it `closestCenter` happily designated the
  // scene of another act, and the drag froze with nothing explaining why (the gesture
  // was refused, but only at the end). Filtered, the list parts exactly where the
  // drop will take place.
  const collision = (args) => {
    const [kind, ai] = String(args.active.id).split(":");
    const prefix = kind === "act" ? "act:" : `scene:${ai}:`;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith(prefix)
      ),
    });
  };

  // The PLAY's title is the only name that is still typed in: an act and a scene
  // draw their label from their rank (structureLabels.js), so they are not renamed.
  // The HISTORY_BREAK closes the run of keystrokes when the field is left,
  // `history.js` merging it into a single undo step.
  const breakHistory = () => dispatch({ type: "HISTORY_BREAK" });

  const askDeleteAct = (ai) => {
    if (actCounts[ai] === 0) onDeleteAct(ai);
    else setPending({ kind: "act", actIndex: ai, count: actCounts[ai], title: actLabel(tPlay, ai) });
  };

  const askDeleteScene = (ai, si) => {
    const scene = script.acts[ai].scenes[si];
    if (scene.lines.length === 0) onDeleteScene(ai, si);
    else
      setPending({
        kind: "scene",
        actIndex: ai,
        sceneIndex: si,
        count: scene.lines.length,
        title: sceneLabel(tPlay, si),
      });
  };

  return (
    <>
      {/* The root of the plan. No label written above it: the panel's head already
          says "Structure", two stacked labels would compete, and the field is in
          serif like the title the top row displays at the very same moment. It is
          the `aria-label` that names it, the visual cue is that echo.
          It is the only one of the three that accepts staying empty, and it always
          has: a play being written may not have a title yet, and the site's five
          headers know how to write that ("Untitled play"). A nameless act or scene,
          on the other hand, would be nothing but a blank box in the plan, with
          nothing to designate it. */}
      <input
        type="text"
        className="structure-field play-title-input"
        aria-label={t("structure.playTitle")}
        placeholder={t("structure.playTitle")}
        value={script.title}
        onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
        onBlur={breakHistory}
      />

      {/* The language of the PLAY, right under its title: both describe the
          document, whereas everything that follows describes its shape.
          This is NOT the interface language (that one is chosen on the home page and
          does not belong to the play): it is the one the company wrote in, and it
          serves two things that could not be set before. The PDF composes its
          headings and its hyphenation with it, and the synthetic voice that stands
          in for a line not yet recorded finally speaks the language of the text it
          reads, instead of a French imposed on every play.
          A written label rather than a mere tooltip: unlike the title, a flag does
          not say by itself what it designates, and two flags alone in a row could
          just as well be choosing the site's language (that one is chosen on the
          home page).
          **Flags and no longer a `<select>`**, as at the foot of the home pages: an
          `<option>` cannot carry an image, so the two places where one chooses a
          language could not look alike as long as this one was a dropdown list.
          These are real radio buttons, hidden under their flag: arrow-key
          navigation, the grouping and the "checked" state are then the browser's,
          where `<button>` elements plus a hand-set `role="radio"` would have
          required rewriting the roving `tabIndex` of a radio group.
          It remains a FIELD that describes the document, and not the site's language
          selector: one declares a piece of the play's data here, it goes off into
          `script.json`, and nothing here reloads the page (see LocaleSwitch.jsx,
          which explains why the two are not confused despite the same flags). */}
      <div className="structure-language">
        <span className="structure-language-label" id={languageLabelId}>
          {t("structure.language")}
        </span>
        <div
          className="structure-language-flags"
          role="radiogroup"
          aria-labelledby={languageLabelId}
        >
          {LOCALES.map((locale) => {
            const name = t(`structure.language.${locale}`);
            const current = script.language === locale;
            return (
              <label
                key={locale}
                className={`structure-language-flag ${current ? "current" : ""}`}
                title={name}
              >
                {/* The language's name is carried by the field (the flag is
                    `aria-hidden`), and it is TRANSLATED: "Anglais" in a French
                    interface, unlike the endonyms of the site's selector. Here one
                    states a fact about a document, in the language one reads it
                    in. */}
                <input
                  type="radio"
                  name="play-language"
                  value={locale}
                  checked={current}
                  aria-label={name}
                  onChange={() => dispatch({ type: "SET_LANGUAGE", language: locale })}
                />
                <FlagIcon locale={locale} />
              </label>
            );
          })}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        {/* An `<ol>` of acts, each carrying an `<ol>` of scenes: a screen reader
            announces the plan as a plan, and the rank it states is the one that
            names the act ("Acte II"). */}
        <ol className="structure-acts">
          <SortableContext
            items={script.acts.map((_, ai) => `act:${ai}`)}
            strategy={verticalListSortingStrategy}
          >
            {script.acts.map((act, ai) => (
              <ActItem
                key={ai}
                act={act}
                actIndex={ai}
                tPlay={tPlay}
                lineCount={actCounts[ai]}
                currentScene={ai === actIndex ? sceneIndex : -1}
                currentRow={currentRow}
                deletable={script.acts.length > 1}
                onGo={onGo}
                onAddScene={onAddScene}
                onDeleteAct={askDeleteAct}
                onDeleteScene={askDeleteScene}
              />
            ))}
          </SortableContext>
        </ol>
      </DndContext>

      {/* Below the list and outside its scrolling, like the character add form: on a
          five-act play it stays in sight.
          Same `structure-add` class as each act's "+ Scene", and no longer `.btn`:
          the plan's two additions are the same thing at two levels, so they are
          drawn the same way (see editor.css). */}
      <button className="structure-add structure-add-act" onClick={onAddAct}>
        {t("structure.addAct")}
      </button>

      {pending && (
        <ConfirmModal
          title={t("common.deleteConfirm", { name: fmt.quote(pending.title) })}
          confirmLabel={t("common.delete")}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            if (pending.kind === "act") onDeleteAct(pending.actIndex);
            else onDeleteScene(pending.actIndex, pending.sceneIndex);
          }}
        >
          <p>{t("structure.deleteLines", { count: pending.count })}</p>
        </ConfirmModal>
      )}
    </>
  );
}

function ActItem({
  act,
  actIndex,
  tPlay,
  lineCount,
  currentScene,
  currentRow,
  deletable,
  onGo,
  onAddScene,
  onDeleteAct,
  onDeleteScene,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `act:${actIndex}`,
  });

  // The act one is in: the one whose scene is open.
  const current = currentScene >= 0;

  return (
    <li
      ref={setNodeRef}
      className="structure-act"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div className={`structure-row act ${current ? "current" : ""}`}>
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={t("structure.moveAct", { act: actLabel(tPlay, actIndex) })}
        />
        {/* A label, no longer a field: an act's name is derived from its rank and is
            not typed in. It leads nowhere either (the act is not a page of the
            editor, the scene is), so it is neither a field nor a button, just text.
            Nothing is lost at the keyboard: tabbing used to reach this field in
            order to rename it, but there is nothing left to rename there, and the
            scenes just below each have their own button. */}
        {/* The label is in the language of the play, the sentence that QUOTES it
            (the ✕'s `aria-label`) in the reader's: a string parameter travels
            through intact, as an act's roman numeral always has (see i18n.js). */}
        <span className="structure-name structure-name-static truncate">
          {actLabel(tPlay, actIndex)}
        </span>
        <CountBadge count={lineCount} className="structure-count" />
        {deletable && (
          <button
            className="chip-delete"
            title={t("structure.deleteAct")}
            aria-label={t("structure.deleteAct.named", { act: actLabel(tPlay, actIndex) })}
            onClick={() => onDeleteAct(actIndex)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      <ol className="structure-scenes">
        <SortableContext
          items={act.scenes.map((_, si) => `scene:${actIndex}:${si}`)}
          strategy={verticalListSortingStrategy}
        >
          {act.scenes.map((scene, si) => (
            <SceneItem
              key={si}
              scene={scene}
              actIndex={actIndex}
              sceneIndex={si}
              tPlay={tPlay}
              current={si === currentScene}
              rowRef={si === currentScene ? currentRow : null}
              deletable={act.scenes.length > 1}
              onGo={onGo}
              onDelete={onDeleteScene}
            />
          ))}
        </SortableContext>
      </ol>

      {/* One "+ Scene" per act, and no longer a single button that added to the
          current act: in a plan, the place where the scene lands must be pointed
          at. */}
      <button
        className="structure-add structure-add-scene"
        onClick={() => onAddScene(actIndex)}
      >
        {t("structure.addScene")}
      </button>
    </li>
  );
}

function SceneItem({
  scene,
  actIndex,
  sceneIndex,
  tPlay,
  current,
  rowRef,
  deletable,
  onGo,
  onDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `scene:${actIndex}:${sceneIndex}`,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      {/* The scroll-into-view ref is set on the row and not on the `<li>`, which
          already carries dnd-kit's.
          **The WHOLE row opens the scene**, and not only its name: in a list of
          scenes, the line is the object, and aiming at a 60 px word to change scene
          required knowing that the name was the target. That is also why the name no
          longer carries any drawing of its own (neither frame nor background, see
          editor.css): what responds to hover is the row.
          No `role="button"` nor `tabIndex` on this `<div>`: it already contains three
          buttons, including the name's, and the keyboard path goes through that one.
          So this handler only adds a mouse convenience, it is the sole access to
          nothing. */}
      <div
        ref={rowRef}
        className={`structure-row scene ${current ? "current" : ""}`}
        onClick={() => onGo(actIndex, sceneIndex)}
      >
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={t("structure.moveScene", { scene: sceneLabel(tPlay, sceneIndex) })}
        />
        {/* A BUTTON and no longer an input field: a scene is no longer renamed (its
            label comes from its rank), but it remains the one thing in the plan one
            NAVIGATES to, so it must stay reachable at the keyboard. The field carried
            that path by accident (tabbing reached it in order to rename, and focusing
            it opened the scene along the way); a button carries it for good, and both
            Enter and Space activate it. A button that does NOT look like a field,
            however: it had kept the white frame, which left the plan promising an
            entry that no longer exists (see editor.css).
            The open scene is not signalled by colour alone: the button carries
            `aria-current`, like the search's current match. */}
        <button
          type="button"
          className="structure-name structure-scene-name truncate"
          aria-current={current ? "true" : undefined}
          title={t("structure.openScene")}
          onClick={() => onGo(actIndex, sceneIndex)}
        >
          {sceneLabel(tPlay, sceneIndex)}
        </button>
        <CountBadge count={scene.lines.length} className="structure-count" />
        {deletable && (
          <button
            className="chip-delete"
            title={t("structure.deleteScene")}
            aria-label={t("structure.deleteScene.named", { scene: sceneLabel(tPlay, sceneIndex) })}
            /* The ✕ does not travel through the row: deleting a scene is not a way
               of going to it, and the confirmation would open onto a column that
               has just changed scene. */
            onClick={(e) => {
              e.stopPropagation();
              onDelete(actIndex, sceneIndex);
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
    </li>
  );
}

// The lines' handle, with the same character and the same verb: it is the same
// gesture, on another object of the play, so it keeps the `drag-handle` class (with
// its cursor and its `touch-action`) and only adds the tightening of its box, cut
// over there for a 40 px row.
function DragHandle({ attributes, listeners, label }) {
  return (
    <button
      className="drag-handle structure-handle"
      title={t("common.dragHandle")}
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}
