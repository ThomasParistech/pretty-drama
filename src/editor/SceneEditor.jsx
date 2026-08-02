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

// React.memo: only the edited scene changes identity per keystroke. Hence `language`
// as a STRING with the translator built here: a bound `t` passed as a prop would be a
// fresh value on every parent render and defeat the memo.
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
      {/* Title in the PLAY's language (a document heading), count in the READER's
          (interface). They sit side by side and say two different things. */}
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
                {/* `null` to every other row: shallowly equal to their last render,
                    so React.memo keeps skipping them. */}
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

      {/* No "+ Line" button: Enter inside a line creates the next one. An empty
          scene still needs a way to create the first. */}
      {scene.lines.length === 0 && canAddLines && (
        <button className="add-first-line-btn" onClick={() => addLine(actIndex, sceneIndex, null)}>
          {t("scene.firstLine")}
        </button>
      )}
      {/* Section name INTERPOLATED from its own key: a copy would drift. */}
      {!canAddLines && (
        <p className="scene-empty-hint">
          {t("scene.needCharacter", { section: fmt.quote(t("rail.characters")) })}
        </p>
      )}
    </div>
  );
});
