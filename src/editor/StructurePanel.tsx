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
import { dragStyle } from "./dragStyle.ts";
import ConfirmModal from "../shared/ConfirmModal.tsx";
import CountBadge from "./CountBadge.tsx";
import { FlagIcon } from "../shared/icons.tsx";
import { LOCALES } from "../shared/i18n.ts";
import { fmt, t, translator } from "../shared/locale.ts";
import { actLabel, sceneLabel } from "../shared/structureLabels.ts";
import type { RefObject } from "react";
import type { CollisionDetection, DragEndEvent, DraggableAttributes } from "@dnd-kit/core";
import type { ScriptAction } from "./reducer.ts";
import type { Act, Locale, Scene, Script, Translate } from "../shared/types.ts";

// dnd-kit's listener bag, named through the hook rather than a deep import into the
// package's internals.
type DragListeners = ReturnType<typeof useSortable>["listeners"];

// The deletion being confirmed: one state for both objects, the question differing
// only in the noun.
type Pending =
  | { kind: "act"; actIndex: number; sceneIndex?: undefined; count: number; title: string }
  | { kind: "scene"; actIndex: number; sceneIndex: number; count: number; title: string };

// The play's plan: the editor's NAVIGATION and the only place the structure is
// shaped. ONLY THE PLAY HAS A NAME: acts and scenes derive their label from their
// rank (structureLabels.ts), composed in the PLAY's language, word for word what the
// PDF prints. Accepted cost: an act cannot be called "Prologue".
// A scene is what one NAVIGATES to, so its name is a real BUTTON, keyboard-reachable;
// an act name leads nowhere, so it is plain text.
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
}: {
  script: Script;
  actIndex: number;
  sceneIndex: number;
  dispatch: (action: ScriptAction) => void;
  onGo: (actIndex: number, sceneIndex: number) => void;
  onAddAct: () => void;
  onAddScene: (actIndex: number) => void;
  onDeleteAct: (actIndex: number) => void;
  onDeleteScene: (actIndex: number, sceneIndex: number) => void;
  onMoveAct: (from: number, to: number) => void;
  onMoveScene: (actIndex: number, from: number, to: number) => void;
}) {
  // One state and one modal for both objects: the question differs only in the noun.
  // Nothing is asked when the object is empty.
  const [pending, setPending] = useState<Pending | null>(null);

  // A radiogroup is labelled by id, not by `<label>`; `useId` so mounting twice is safe.
  const languageLabelId = useId();

  // Bound to the PLAY's language, passed DOWN as a prop: two components reading the
  // language on their own would let the plan and the text column drift.
  const tPlay = translator(script.language);

  // Only WHEN THE SECTION OPENS: a five-act plan is taller than the panel. The panel
  // is unmounted while closed, so a mount effect suffices, and no dependencies because
  // navigating from here must not move the list under the cursor.
  const currentRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const sensors = useSensors(
    // A simple click on a scene must go to it, not start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // One pass over the play rather than a sum per act on every row render.
  const actCounts = useMemo(
    () => script.acts.map((a) => a.scenes.reduce((n, s) => n + s.lines.length, 0)),
    [script.acts]
  );

  // Acts and scenes have no id: the dnd-kit identity is the type-prefixed RANK, stable
  // for the duration of a drag and what MOVE_ACT / MOVE_SCENE expect.
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = String(active.id).split(":");
    const to = String(over.id).split(":");
    if (from[0] === "act" && to[0] === "act") {
      onMoveAct(Number(from[1]), Number(to[1]));
    } else if (from[0] === "scene" && to[0] === "scene" && from[1] === to[1]) {
      onMoveScene(Number(from[1]), Number(from[2]), Number(to[2]));
    }
  };

  // Filtered HERE and not only as a guard on arrival: the two nested `SortableContext`
  // share one `DndContext`, so `closestCenter` otherwise designates another act's scene
  // and the drag freezes with nothing to explain it.
  const collision: CollisionDetection = (args) => {
    const [kind, ai] = String(args.active.id).split(":");
    const prefix = kind === "act" ? "act:" : `scene:${ai}:`;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith(prefix)
      ),
    });
  };

  // Closes the keystroke run when the field is left; history.ts merges it into one step.
  const breakHistory = () => dispatch({ type: "HISTORY_BREAK" });

  const askDeleteAct = (ai: number) => {
    if (actCounts[ai] === 0) onDeleteAct(ai);
    else
      setPending({
        kind: "act",
        actIndex: ai,
        count: actCounts[ai]!,
        title: actLabel(tPlay, ai),
      });
  };

  const askDeleteScene = (ai: number, si: number) => {
    const scene = script.acts[ai]!.scenes[si]!;
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
      {/* No visible label: the panel head already says "Structure", and the serif
          echoes the title in the top row. May stay empty; the headers write
          "Untitled play". */}
      <input
        type="text"
        className="structure-field play-title-input"
        aria-label={t("structure.playTitle")}
        placeholder={t("structure.playTitle")}
        value={script.title}
        onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
        onBlur={breakHistory}
      />

      {/* The PLAY's language, right under its title: both describe the document. NOT
          the interface language (see LocaleSwitch.tsx): this one drives the PDF's
          headings and hyphenation and the synthetic voice, and it goes into script.json.
          A written label, because two flags alone could be read as the site's switch.
          Real radio buttons under the flags, so arrow-key navigation, grouping and the
          checked state are the browser's rather than a hand-rolled roving tabIndex. */}
      <div className="structure-language">
        <span className="structure-language-label" id={languageLabelId}>
          {t("structure.language")}
        </span>
        <div
          className="structure-language-flags"
          role="radiogroup"
          aria-labelledby={languageLabelId}
        >
          {(LOCALES as Locale[]).map((locale) => {
            const name = t(`structure.language.${locale}`);
            const current = script.language === locale;
            return (
              <label
                key={locale}
                className={`structure-language-flag ${current ? "current" : ""}`}
                title={name}
              >
                {/* TRANSLATED ("Anglais" in a French UI), unlike the site switch's
                    endonyms: here one states a fact about a document. */}
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
        {/* Nested `<ol>`: a screen reader announces the plan as a plan, and the rank
            it states is the one that names the act. */}
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
                lineCount={actCounts[ai]!}
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

      {/* Outside the scrolling, so it stays in sight. Same class as "+ Scene": the
          plan's two additions are the same thing at two levels. */}
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
}: {
  act: Act;
  actIndex: number;
  tPlay: Translate;
  lineCount: number;
  currentScene: number;
  currentRow: RefObject<HTMLDivElement>;
  deletable: boolean;
  onGo: (actIndex: number, sceneIndex: number) => void;
  onAddScene: (actIndex: number) => void;
  onDeleteAct: (actIndex: number) => void;
  onDeleteScene: (actIndex: number, sceneIndex: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `act:${actIndex}`,
  });

  const current = currentScene >= 0;

  return (
    <li
      ref={setNodeRef}
      className="structure-act"
      style={dragStyle(transform, transition, isDragging)}
    >
      <div className={`structure-row act ${current ? "current" : ""}`}>
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={t("structure.moveAct", { act: actLabel(tPlay, actIndex) })}
        />
        {/* Plain text: an act's name is derived and leads nowhere. The label is in the
            PLAY's language, the sentence quoting it in the READER's.
            NO `title` here, unlike the `.truncate` rule's default: the label is DERIVED
            FROM RANK, so it is bounded ("Acte XXXIX" at worst, and `romanNumeral` gives
            up past 39). It is not user data and cannot grow, so `.truncate` is a safety
            net, not a promise that something was hidden. A tooltip would only repeat a
            label already fully on screen. Same for the scene button below. */}
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

      {/* One per act: in a plan, where the scene lands must be pointed at. */}
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
}: {
  scene: Scene;
  actIndex: number;
  sceneIndex: number;
  tPlay: Translate;
  current: boolean;
  // `RefObject<T>`, not `RefObject<T | null>`: the ref is HANDED DOWN to a `ref=`, and
  // React 18's `RefObject` already carries the null itself. Written the other way it
  // type-checks only against the React 19 types, which are not the React this runs on.
  rowRef: RefObject<HTMLDivElement> | null;
  deletable: boolean;
  onGo: (actIndex: number, sceneIndex: number) => void;
  onDelete: (actIndex: number, sceneIndex: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `scene:${actIndex}:${sceneIndex}`,
  });

  return (
    <li
      ref={setNodeRef}
      style={dragStyle(transform, transition, isDragging)}
    >
      {/* The ref goes on the row, the `<li>` already carrying dnd-kit's.
          The WHOLE row opens the scene, as a MOUSE convenience only: no `role`/
          `tabIndex` here, the keyboard path goes through the name button inside. */}
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
        {/* A BUTTON, so the keyboard can still open a scene, but drawn as no field:
            a white frame would promise an entry that no longer exists. `aria-current`
            so the open scene is not signalled by colour alone.
            `title` is the GESTURE and not the label, on purpose: the label is derived
            from rank (see the act row above), so nothing is ever hidden by `.truncate`,
            and this title is also the button's accessible name. */}
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
            /* Deleting a scene is not a way of going to it. */
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

// The lines' handle, same class and verb, only tightened for a shorter row.
function DragHandle({
  attributes,
  listeners,
  label,
}: {
  attributes: DraggableAttributes;
  listeners: DragListeners;
  label: string;
}) {
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
