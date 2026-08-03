import { useEffect } from "react";
import type { RefObject } from "react";

// True while a pointer DRAGS the bottom bar's handle. A module flag and not a prop:
// producer and consumer are these two shared modules, and a document has one bar.
let dragging = false;

export function setSeekDragging(on: boolean): void {
  dragging = on;
}

// Follow the drag: 90% of the way in 110 ms, replacing smooth `scrollIntoView`, whose
// several hundred ms restart at every notch and leave the list lagging the mouse.
// Exponential and not a fixed duration on purpose: a new notch MOVES the target rather
// than restarting, so there is no discontinuity mid-gesture.
const FOLLOW_MS = 110;
let followTarget = 0;
let followFrame = 0;
let followAt = 0;

// Both pages scroll with the DOCUMENT (the bar is `fixed`, the container has no
// `overflow`). A list in its own scroller would need walking up to the scrolling
// ancestor; `scrollIntoView` below does that by itself.
const scroller = () => document.scrollingElement;

// Scroll position that centres the card, read from the CURRENT position so it stays
// correct with an animation in flight.
// CLAMPED to the real travel: a card at either end cannot be centred, the browser
// clamps the `scrollTop` assignment, and the loop below would then spin one frame
// every 16 ms forever with a constant `delta`.
function centerTarget(card: Element, el: Element): number {
  const rect = card.getBoundingClientRect();
  const wanted = el.scrollTop + rect.top + rect.height / 2 - el.clientHeight / 2;
  return Math.max(0, Math.min(wanted, el.scrollHeight - el.clientHeight));
}

function followStep(now: number): void {
  const el = scroller();
  if (!el) return;
  const dt = Math.min(50, now - followAt);
  followAt = now;
  const delta = followTarget - el.scrollTop;
  if (Math.abs(delta) < 0.5) {
    el.scrollTop = followTarget;
    followFrame = 0;
    return;
  }
  const before = el.scrollTop;
  el.scrollTop += delta * (1 - Math.pow(0.1, dt / FOLLOW_MS));
  // Second exit, for the travel changing UNDER the loop (header collapsed mid-gesture,
  // font finishing loading): a frame that moved zero pixels will not move on the next.
  if (el.scrollTop === before) {
    followFrame = 0;
    return;
  }
  followFrame = requestAnimationFrame(followStep);
}

function followCard(card: Element, instant: boolean): void {
  const el = scroller();
  if (!el) return;
  followTarget = centerTarget(card, el);
  if (instant) {
    if (followFrame) cancelAnimationFrame(followFrame);
    followFrame = 0;
    el.scrollTop = followTarget;
    return;
  }
  if (followFrame) return; // Loop already in flight: only the target has moved.
  followAt = performance.now();
  followFrame = requestAnimationFrame(followStep);
}

// Keeps `.dialogue-card.active` centred when the selection changes (Rehearsal and
// Recording). `deps`: the indices whose change re-centres.
export default function useScrollToActiveCard(
  listRef: RefObject<HTMLElement | null>,
  deps: unknown[]
): void {
  useEffect(() => {
    const card = listRef.current?.querySelector(".dialogue-card.active");
    if (!card) return;
    // Read here and not in CSS: a scroll smoothed from JS is out of reach of the
    // `prefers-reduced-motion` block.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (dragging) {
      // The flag is CONSUMED: the drag raises it again at every notch, so smoothing
      // comes back by itself if the end of the gesture goes missing.
      dragging = false;
      followCard(card, reduced);
      return;
    }
    // Discrete jump: the browser's smoothing. A follow loop in flight would fight it.
    if (followFrame) cancelAnimationFrame(followFrame);
    followFrame = 0;
    card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
