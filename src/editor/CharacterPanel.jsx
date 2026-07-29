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

// La gestion des personnages : une puce par personnage (pastille de couleur,
// renommage en place, compte de répliques, suppression) et le formulaire
// d'ajout. Les répliques ne référencent ces entrées que par id, donc un
// renommage se propage partout et ne touche jamais un id de réplique.
//
// Elle vit dans la section « Personnages » du rail (cf. EditorRail.jsx), et
// plus dans le bandeau, où les autres pages ont leur select de personnage : le
// bandeau est partagé par quatre pages et n'a de place que pour ce que les
// quatre ont en commun, alors que cette liste grandit avec la distribution.
//
// Une vraie `<ul>` : un lecteur d'écran annonce « liste de 7 éléments », donc la
// distribution de la pièce devient un objet et pas une suite de boutons.
export default function CharacterPanel({ characters, lineCounts, dispatch, onRequestDelete }) {
  const [newName, setNewName] = useState("");

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    dispatch({ type: "ADD_CHARACTER", id: newId(), name });
    setNewName("");
  };

  return (
    <>
      {characters.length === 0 ? (
        <p className="character-empty">Aucun personnage pour l'instant :</p>
      ) : (
        <ul className="character-list">
          {characters.map((c) => (
            <CharacterItem
              key={c.id}
              character={c}
              lineCount={lineCounts.get(c.id) ?? 0}
              onRename={(name) => dispatch({ type: "RENAME_CHARACTER", id: c.id, name })}
              onSetHue={(hue) => dispatch({ type: "SET_CHARACTER_HUE", id: c.id, hue })}
              onDelete={() => onRequestDelete(c)}
            />
          ))}
        </ul>
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
        {/* « + Personnage » et pas « + Ajouter » : les trois boutons d'ajout du
            rail se lisent dans le même meuble (« + Acte », « + Scène »), donc ils
            nomment tous l'objet qu'ils créent, et le champ voisin dit déjà
            « Nom du personnage ». */}
        <button type="submit" className="btn small" disabled={!newName.trim()}>
          + Personnage
        </button>
      </form>
    </>
  );
}

function CharacterItem({ character, lineCount, onRename, onSetHue, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(character.name);
  const [pickerOpen, setPickerOpen] = useState(false);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== character.name) onRename(draft);
    else setDraft(character.name);
  };

  return (
    <li className="character-item">
      <span className="character-chip">
        <button
          className="character-swatch"
          title="Changer la couleur"
          aria-label={`Changer la couleur de ${character.name}`}
          style={{ background: hueColor(character.hue) }}
          onClick={() => setPickerOpen((o) => !o)}
        />

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
        {/* Un nombre nu ne dit pas ce qu'il compte : « Marie, 12 » à la voix, et
            rien du tout à la souris. Le `role="img"` plus l'`aria-label` sont le
            motif du sceau (`PageMark`), le seul qui rende un `aria-label` valable
            sur un `<span>`. Le chiffre reste seul à l'écran, la colonne des
            comptes devant s'aligner. */}
        <span
          className="character-count"
          role="img"
          aria-label={`${lineCount} réplique${lineCount > 1 ? "s" : ""}`}
          title={`${lineCount} réplique${lineCount > 1 ? "s" : ""}`}
        >
          {lineCount}
        </span>
        <button
          className="chip-delete"
          title="Supprimer ce personnage"
          aria-label={`Supprimer ${character.name}`}
          onClick={onDelete}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </span>

      {/* La palette est SŒUR de la puce et plus son enfant : elle se pose dans le
          flux du panneau, sous le personnage, et pousse les suivants (le panneau
          du rail défile, donc il rognerait une boîte accrochée à la puce).
          Le fond plein écran qui la ferme reste : on clique une couleur, ou à
          côté pour renoncer. */}
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
    </li>
  );
}
