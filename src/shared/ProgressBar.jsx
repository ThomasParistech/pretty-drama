import React, { useRef, useState } from "react";
import { t } from "./locale.js";
import { setSeekDragging } from "./useScrollToActiveCard.js";

// Item-indexed scrubber of the bottom control bar (shared by the rehearsal
// and recording pages): click or drag seeks to an index in [0, count);
// focusable, arrow keys step one item, Home/End jump to the edges.
export default function ProgressBar({ value, count, onSeek, disabled = false }) {
  const ref = useRef(null);
  // Glissement en cours, ce que les deux surfaces qui traînaient derrière la
  // souris ont besoin de savoir : le pouce et le remplissage perdent leur
  // transition (classe `dragging`, cf. `.progress-container.dragging` dans
  // theme.css), et la liste échange le défilement lissé du navigateur, trop
  // long, contre un suivi rapide (`setSeekDragging`, cf.
  // `useScrollToActiveCard.js`).
  const [dragging, setDragging] = useState(false);

  const scrub = (clientX) => {
    if (disabled || count === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(Math.round(fraction * (count - 1)));
  };

  const onKeyDown = (e) => {
    if (disabled || count === 0) return;
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    let next;
    if (step != null) next = Math.max(0, Math.min(count - 1, value + step));
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    else return;
    e.preventDefault();
    if (next !== value) onSeek(next);
  };

  return (
    <div
      className={dragging ? "progress-container dragging" : "progress-container"}
      ref={ref}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={t("common.progressPosition")}
      aria-valuemin={1}
      aria-valuemax={Math.max(count, 1)}
      aria-valuenow={Math.min(value + 1, count)}
      aria-disabled={disabled || count === 0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (disabled || count === 0) return;
        ref.current.setPointerCapture(e.pointerId);
        scrub(e.clientX);
      }}
      onPointerMove={(e) => {
        // Le même garde que `scrub` et `onPointerDown`, et il porte ici sur le
        // drapeau PARTAGÉ : un geste qui ne peut pas déplacer le curseur n'a pas
        // à annoncer un glissement à la liste. Sans lui, survoler une barre
        // désactivée bouton enfoncé levait un drapeau que seule la fin du geste
        // repose, or il n'y a pas de fin (rien n'a capturé le pointeur), donc le
        // prochain recentrage se faisait en suivi rapide au lieu du lissé.
        if (disabled || count === 0 || e.buttons === 0) return;
        // Le premier mouvement du geste fait basculer les deux lissés : à
        // partir de là le pouce et la carte active collent au pointeur. Le
        // drapeau partagé est reposé à chaque cran parce que le recentrage le
        // consomme (cf. `useScrollToActiveCard.js`).
        setDragging(true);
        setSeekDragging(true);
        scrub(e.clientX);
      }}
      // `setPointerCapture` garantit cet événement à la fin du geste (relâché
      // ou annulé), donc c'est le seul endroit à rendre le lissé.
      onLostPointerCapture={() => {
        setDragging(false);
        setSeekDragging(false);
      }}
    >
      <div
        className="progress-fill"
        style={{ width: count > 1 ? `${(value / (count - 1)) * 100}%` : "0%" }}
      />
      <div
        className="progress-thumb"
        style={{ left: count > 1 ? `${(value / (count - 1)) * 100}%` : "0%" }}
      />
    </div>
  );
}
