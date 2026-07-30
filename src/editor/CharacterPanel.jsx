import React, { useState } from "react";
import { CHARACTER_COLOR_KEYS, CHARACTER_COLORS } from "../shared/characterColors.js";
import { t } from "../shared/locale.js";
import CountBadge from "./CountBadge.jsx";
import { newId } from "./reducer.js";

// La gestion des personnages : une puce par personnage (pastille de couleur,
// renommage en place, compte de répliques, suppression) et le formulaire
// d'ajout. Les répliques ne référencent ces entrées que par id, donc un
// renommage se propage partout et ne touche jamais un id de réplique.
//
// Elle vit dans la section « Personnages » du rail (cf. EditorRail.jsx), et
// plus dans le bandeau, où les autres pages ont leur select de personnage : le
// bandeau est partagé par cinq pages et n'a de place que pour ce que les cinq
// ont en commun, alors que cette liste grandit avec la distribution.
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
        <p className="character-empty">{t("characters.empty")}</p>
      ) : (
        <ul className="character-list">
          {characters.map((c) => (
            <CharacterItem
              key={c.id}
              character={c}
              lineCount={lineCounts.get(c.id) ?? 0}
              onRename={(name) => dispatch({ type: "RENAME_CHARACTER", id: c.id, name })}
              onSetColor={(color) => dispatch({ type: "SET_CHARACTER_COLOR", id: c.id, color })}
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
          placeholder={t("characters.namePlaceholder")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        {/* « + Personnage » et pas « + Ajouter » : les trois boutons d'ajout du
            rail se lisent dans le même meuble (« + Acte », « + Scène »), donc ils
            nomment tous l'objet qu'ils créent, et le champ voisin dit déjà
            « Nom du personnage ». */}
        <button type="submit" className="btn small" disabled={!newName.trim()}>
          {t("characters.add")}
        </button>
      </form>
    </>
  );
}

function CharacterItem({ character, lineCount, onRename, onSetColor, onDelete }) {
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
          title={t("characters.changeColor")}
          aria-label={t("characters.changeColorOf", { name: character.name })}
          style={{ background: character.color }}
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
          <button
            className="character-name truncate"
            title={t("characters.rename")}
            onClick={() => setEditing(true)}
          >
            {character.name}
          </button>
        )}
        <CountBadge count={lineCount} className="character-count" />
        <button
          className="chip-delete"
          title={t("characters.delete")}
          aria-label={t("characters.deleteNamed", { name: character.name })}
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
          {/* Vingt pastilles en deux rangées de dix (cf. `.swatch-popover`) : la
              rangée du haut est Tableau 10, celle du bas ses dix teintes claires,
              soit la structure même de tab20 dont la palette est tirée. */}
          <div className="swatch-popover">
            {CHARACTER_COLORS.map((color, i) => (
              <button
                key={color}
                className={`swatch ${color === character.color ? "current" : ""}`}
                /* Chaque pastille se NOMME : vingt boutons « Choisir cette
                   couleur » étaient vingt homonymes, et la couleur, leur seule
                   information, ne se disait pas à la voix.
                   « la couleur X » et pas « le X » : sur vingt noms, quatre
                   commencent par une voyelle (orange, olive, et leurs teintes
                   claires) et l'article ne s'y élide pas. Un nom de couleur
                   apposé se passe d'accord, alors qu'un adjectif en demanderait
                   un (« la couleur orange », mais « la pastille orange »). */
                aria-label={
                  color === character.color
                    ? t("characters.colorCurrent", { color: t(CHARACTER_COLOR_KEYS[i]) })
                    : t("characters.colorChoose", {
                        color: t(CHARACTER_COLOR_KEYS[i]).toLowerCase(),
                      })
                }
                title={
                  color === character.color
                    ? t("characters.colorCurrent", { color: t(CHARACTER_COLOR_KEYS[i]) })
                    : t(CHARACTER_COLOR_KEYS[i])
                }
                style={{ background: color }}
                onClick={() => {
                  onSetColor(color);
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
