import React, { useRef, useState } from "react";
import { t } from "./locale.js";
import { setSeekDragging } from "./useScrollToActiveCard.js";

// Item-indexed scrubber of the bottom control bar (shared by the rehearsal
// and recording pages): click or drag seeks to an index in [0, count);
// focusable, arrow keys step one item, Home/End jump to the edges.
export default function ProgressBar({ value, count, onSeek, disabled = false }) {
  const ref = useRef(null);
  // Drag in progress: the thumb and fill drop their transition, and the list swaps
  // smooth scrolling for a fast follow (`setSeekDragging`, useScrollToActiveCard.js).
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
        // Repeat `scrub`'s guard, here bearing on the SHARED flag: hovering a
        // disabled bar button-down would raise a flag nothing ever lowers (no
        // pointer captured, so no `lostpointercapture`).
        if (disabled || count === 0 || e.buttons === 0) return;
        // Raised at every notch because the recentring CONSUMES it
        // (useScrollToActiveCard.js).
        setDragging(true);
        setSeekDragging(true);
        scrub(e.clientX);
      }}
      // `setPointerCapture` guarantees this fires at the end of the gesture, released
      // or cancelled, so it is the only place the easings come back.
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
