import React from "react";
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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import LineRow from "./LineRow.jsx";
import { sceneLabel } from "../shared/structureLabels.js";
import { fmt, t, translator } from "../shared/locale.js";

// React.memo: only the scene being edited changes identity per keystroke. Hence
// the play's language received as a STRING and the translator built here: a bound
// `t`, passed as a prop, would be a fresh value on every render of the parent and
// would make the whole scene re-render on every keystroke.
export default React.memo(function SceneEditor({
  scene,
  actIndex,
  sceneIndex,
  language,
  characters,
  dispatch,
  addLine,
  focusRequest,
  onFocusHandled,
}) {
  const sensors = useSensors(
    // Small activation distance so simple clicks in the row don't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) {
      dispatch({ type: "MOVE_LINE", actIndex, sceneIndex, activeId: active.id, overId: over.id });
    }
  };

  const canAddLines = characters.length > 0;

  return (
    <div className="scene-block">
      {/* The title and the count, nothing more: renaming the scene and deleting it
          are gestures of the play's plan (the rail's "Structure" section), not of
          the text one writes. The column says where one is, the rail shapes and
          names.
          The title is in the language of the PLAY (it is the document's heading,
          see structureLabels.js), the line count in the reader's (that is
          interface): the two sit side by side, and they really do say two
          different things. */}
      <div className="scene-header">
        <h3 className="scene-title">{sceneLabel(translator(language), sceneIndex)}</h3>
        <span className="scene-line-count">
          {t("common.lineCount", { count: scene.lines.length })}
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={scene.lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <div className="line-list">
            {scene.lines.map((line, i) => (
              <React.Fragment key={line.id}>
                {/* Discreet hover-revealed insert point between two lines. */}
                {i > 0 && (
                  <div className="insert-zone">
                    <button
                      type="button"
                      onClick={() => addLine(actIndex, sceneIndex, scene.lines[i - 1].id)}
                    >
                      <span className="insert-pill">{t("scene.insert")}</span>
                    </button>
                  </div>
                )}
                {/* `focusRequest` is passed as is to the targeted row, and `null`
                    to all the others: `null` is shallowly equal to their previous
                    render, so React.memo keeps skipping them, and only the
                    targeted row renders again. */}
                <LineRow
                  line={line}
                  characters={characters}
                  actIndex={actIndex}
                  sceneIndex={sceneIndex}
                  focusRequest={focusRequest?.lineId === line.id ? focusRequest : null}
                  onFocusHandled={onFocusHandled}
                  dispatch={dispatch}
                  addLine={addLine}
                />
              </React.Fragment>
            ))}
            {/* Same insert point after the LAST line (appends to the scene). */}
            {scene.lines.length > 0 && canAddLines && (
              <div className="insert-zone end">
                <button type="button" onClick={() => addLine(actIndex, sceneIndex, null)}>
                  <span className="insert-pill">{t("scene.insert")}</span>
                </button>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* No "+ Line" button: once a first line exists, Enter inside a
          line creates the next one (faster). Empty scenes still need a way
          to create that first line. */}
      {scene.lines.length === 0 && canAddLines && (
        <button className="add-first-line-btn" onClick={() => addLine(actIndex, sceneIndex, null)}>
          {t("scene.firstLine")}
        </button>
      )}
      {/* The name of the rail's section is INTERPOLATED from its own key: copying
          it out here would make it drift on the first rename. */}
      {!canAddLines && (
        <p className="scene-empty-hint">
          {t("scene.needCharacter", { section: fmt.quote(t("rail.characters")) })}
        </p>
      )}
    </div>
  );
});
