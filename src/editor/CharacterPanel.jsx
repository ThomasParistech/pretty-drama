import React, { useState } from "react";
import { newId, CHARACTER_HUES } from "./reducer.js";

// "Rail" palette: desaturated, homogeneous lightness — the hue is stored on
// the character (see CHARACTER_HUES in reducer.js).
export function hueColor(hue) {
  return `oklch(0.58 0.14 ${hue})`;
}

// CSS color of a character, or null when the id is unknown.
export function characterColorById(characters, id) {
  const character = characters.find((c) => c.id === id);
  return character ? hueColor(character.hue) : null;
}

// Character management, inline in the play header: one chip per character
// (color swatch + inline rename + line count + delete) and an add form.
// Lines only ever reference these entries by id, so renames propagate
// everywhere and never touch line ids.
export default function CharacterChips({ characters, lineCounts, dispatch, onRequestDelete }) {
  const [newName, setNewName] = useState("");

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    dispatch({ type: "ADD_CHARACTER", id: newId(), name });
    setNewName("");
  };

  return (
    <div className="characters-row">
      {characters.map((c) => (
        <CharacterChip
          key={c.id}
          character={c}
          lineCount={lineCounts.get(c.id) ?? 0}
          onRename={(name) => dispatch({ type: "RENAME_CHARACTER", id: c.id, name })}
          onSetHue={(hue) => dispatch({ type: "SET_CHARACTER_HUE", id: c.id, hue })}
          onDelete={() => onRequestDelete(c)}
        />
      ))}
      {characters.length === 0 && (
        <span className="character-empty">Aucun personnage pour l'instant :</span>
      )}

      <form
        className="character-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          placeholder="Nom du personnage"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn small" disabled={!newName.trim()}>
          + Ajouter
        </button>
      </form>
    </div>
  );
}

function CharacterChip({ character, lineCount, onRename, onSetHue, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(character.name);
  const [pickerOpen, setPickerOpen] = useState(false);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== character.name) onRename(draft);
    else setDraft(character.name);
  };

  return (
    <span className="character-chip">
      <button
        className="character-swatch"
        title="Changer la couleur"
        aria-label={`Changer la couleur de ${character.name}`}
        style={{ background: hueColor(character.hue) }}
        onClick={() => setPickerOpen((o) => !o)}
      />
      {pickerOpen && (
        <>
          <div className="swatch-backdrop" onClick={() => setPickerOpen(false)} />
          <div className="swatch-popover">
            {CHARACTER_HUES.map((h) => (
              <button
                key={h}
                className={`swatch ${h === character.hue ? "current" : ""}`}
                aria-label={h === character.hue ? "Couleur actuelle" : "Choisir cette couleur"}
                title={h === character.hue ? "Couleur actuelle" : "Choisir cette couleur"}
                style={{ background: hueColor(h) }}
                onClick={() => {
                  onSetHue(h);
                  setPickerOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}

      {editing ? (
        <input
          type="text"
          className="character-rename-input"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(character.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button className="character-name" title="Renommer" onClick={() => setEditing(true)}>
          {character.name}
        </button>
      )}
      <span className="character-count">{lineCount}</span>
      <button
        className="chip-delete"
        title="Supprimer ce personnage"
        aria-label={`Supprimer ${character.name}`}
        onClick={onDelete}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </span>
  );
}
