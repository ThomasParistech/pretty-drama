import React, { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { characterColorById } from "./CharacterPanel.jsx";
import ConfirmModal from "../shared/ConfirmModal.jsx";
import { excerpt } from "../shared/data.js";

// One dialogue line: drag handle + character <select> + text + delete.
// Enter inside the textarea inserts a new line right after (like typing in a
// text file, but every "line" is a structured object with a stable id).
//
// React.memo + handlers built here from the stable `dispatch`/`addLine`
// props: rows whose `line` object kept its identity skip re-rendering, so a
// keystroke re-renders only the edited row's scene, not the whole play.
export default React.memo(function LineRow({
  line,
  characters,
  actIndex,
  sceneIndex,
  autoFocus,
  onFocusHandled,
  dispatch,
  addLine,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.id,
  });

  const textareaRef = useRef(null);
  // Deleting a line that has text asks first (an empty line goes silently).
  const [confirming, setConfirming] = useState(false);

  // Auto-grow the textarea to fit its content.
  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(autoGrow, [line.text]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
      onFocusHandled();
    }
  }, [autoFocus, onFocusHandled]);

  // "Rail" design: white background everywhere, the character's color is
  // only an accent — it paints the drag handle and the character select.
  const color = characterColorById(characters, line.characterId);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const known = color != null;

  return (
    <div ref={setNodeRef} style={style} className="line-row">
      <button
        className="drag-handle"
        title="Glisser pour déplacer"
        aria-label="Glisser pour déplacer"
        style={{ color: color ?? "var(--ed-ghost)" }}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <select
        className="line-character"
        aria-label="Personnage de la réplique"
        style={{ color: color ?? "var(--ink-soft)" }}
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
        {!known && <option value="">Personnage ?</option>}
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* onBlur closes the undo step: a later edit of this same line becomes
          a separate one (see history.js). */}
      <textarea
        ref={textareaRef}
        className="line-text"
        rows={1}
        placeholder="Texte de la réplique…"
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
        title="Supprimer cette réplique"
        aria-label="Supprimer cette réplique"
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
          title="Supprimer cette réplique ?"
          confirmLabel="Supprimer"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            dispatch({ type: "DELETE_LINE", actIndex, sceneIndex, lineId: line.id });
          }}
        >
          <p className="confirm-quote">« {excerpt(line.text)} »</p>
        </ConfirmModal>
      )}
    </div>
  );
});
