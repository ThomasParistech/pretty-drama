import React, { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { dragStyle } from "./dragStyle.js";
import { characterColor, characterInk } from "../shared/characterColors.js";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import { excerpt } from "../shared/data.js";
import { fmt, t } from "../shared/locale.js";

// One dialogue line: drag handle + character select + text + delete.
// React.memo with handlers built from the stable `dispatch`/`addLine`: a keystroke
// re-renders only the edited scene, not the whole play.
export default React.memo(function LineRow({
  line,
  characters,
  actIndex,
  sceneIndex,
  focusRequest,
  onFocusHandled,
  dispatch,
  addLine,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.id,
  });

  const textareaRef = useRef(null);
  // Deleting a line that has text asks first; an empty line goes silently.
  const [confirming, setConfirming] = useState(false);

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(autoGrow, [line.text]);

  // Focus/selection request for THIS line (App.jsx): a freshly created line (focus)
  // or a search match (selection, focus only on click, so Enter keeps the search
  // field and stays repeatable).
  useEffect(() => {
    const el = textareaRef.current;
    if (!focusRequest || !el) return;
    if (focusRequest.focus) el.focus();
    if (focusRequest.selection) {
      const [start, end] = focusRequest.selection;
      // Clamped anyway: the request carries offsets into a text that may have moved on.
      const max = el.value.length;
      el.setSelectionRange(Math.min(start, max), Math.min(end, max));
      // `setSelectionRange` does not scroll, unlike `focus()`: without this, keyboard
      // navigation selects out of sight.
      el.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    }
    onFocusHandled();
  }, [focusRequest, onFocusHandled]);

  // The handle and the select are TEXT, so they take the INK and not the flat colour:
  // the palette is made for surfaces and its olive measures 1.87:1 on white.
  const color = characterColor(characters, line.characterId);
  const ink = color === null ? null : characterInk(color);
  const style = dragStyle(transform, transition, isDragging);

  const known = color != null;

  return (
    <div ref={setNodeRef} style={style} className="line-row">
      <button
        className="drag-handle"
        title={t("common.dragHandle")}
        aria-label={t("common.dragHandle")}
        style={{ color: ink ?? "var(--ed-ghost)" }}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <select
        className="line-character"
        aria-label={t("line.character")}
        style={{ color: ink ?? "var(--ink-soft)" }}
        value={known ? line.characterId : ""}
        onChange={(e) =>
          dispatch({
            type: "SET_LINE_CHARACTER",
            actIndex,
            sceneIndex,
            lineId: line.id,
            characterId: e.target.value,
          })
        }
      >
        {!known && <option value="">{t("line.characterUnset")}</option>}
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* onBlur closes the undo step (history.js). */}
      <textarea
        ref={textareaRef}
        className="line-text"
        rows={1}
        placeholder={t("line.placeholder")}
        value={line.text}
        onChange={(e) =>
          dispatch({ type: "EDIT_TEXT", actIndex, sceneIndex, lineId: line.id, text: e.target.value })
        }
        onInput={autoGrow}
        onBlur={() => dispatch({ type: "HISTORY_BREAK" })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addLine(actIndex, sceneIndex, line.id);
          }
        }}
      />

      <button
        className="btn icon small line-delete"
        title={t("line.delete")}
        aria-label={t("line.delete")}
        onClick={() => {
          if (line.text.trim() === "") {
            dispatch({ type: "DELETE_LINE", actIndex, sceneIndex, lineId: line.id });
          } else {
            setConfirming(true);
          }
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>

      {confirming && (
        <ConfirmModal
          title={t("line.deleteConfirm")}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            dispatch({ type: "DELETE_LINE", actIndex, sceneIndex, lineId: line.id });
          }}
        >
          <p className="confirm-quote">{fmt.quote(excerpt(line.text))}</p>
        </ConfirmModal>
      )}
    </div>
  );
});
