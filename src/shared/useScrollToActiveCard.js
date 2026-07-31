import { useEffect } from "react";

// True for as long as a pointer is DRAGGING the handle of the bottom bar
// (`ProgressBar`, its only producer, through `setSeekDragging`). A module flag
// rather than a prop: the producer and the consumer are these two shared modules,
// neither of the two pages has any decision to make about it (and the site being
// multi-page, a document never carries more than one bar).
let dragging = false;

export function setSeekDragging(on) {
  dragging = on;
}

// Following the drag: 90% of the way in 110 ms. This is what replaces
// `scrollIntoView({ behavior: "smooth" })` DURING a drag, and the two problems
// must not be confused. The browser's smoothing is not too gentle, it is too LONG:
// several hundred milliseconds, restarted from the current position at every new
// notch, so the list can only, by construction, lag behind the mouse, and this is
// precisely the gesture where you are watching where you are arriving. An abrupt
// scroll fixed the lag but made the list jump from card to card. Here the target
// moves and the position catches up with it in a tenth of a second: it glides, and
// the eye does not measure the delay. The approach is exponential and not a fixed
// duration, deliberately: a new notch RESTARTS nothing, it moves the target, hence
// no discontinuity in the middle of the gesture. It carries on after the release,
// long enough to finish centring the last card.
const FOLLOW_MS = 110;
let followTarget = 0;
let followFrame = 0;
let followAt = 0;

// The two pages that carry this list scroll with the DOCUMENT (the control bar is
// `fixed`, `.dialogue-container` has no `overflow`). A future list inside its own
// scrolling container would require walking up to the first scrolling ancestor;
// `scrollIntoView`, on the other hand, does that by itself, so the discrete jumps
// below do not have this limit.
const scroller = () => document.scrollingElement;

// The scroll position that centres the card. Relative to the CURRENT position,
// hence correct even if an animation is in flight: we read the gap left to close,
// never a memorised absolute coordinate.
//
// **Bounded to the scroller's real travel**, and this is not caution: a card from
// the very beginning or the very end of the play CANNOT be centred, there is no
// travel beyond the edges, so the wanted position falls outside [0, travel]. The
// browser, for its part, clamps any assignment to `scrollTop`, so the gap never
// closed: the loop below started over on every frame with a constant `delta`,
// indefinitely, until the next discrete jump. Dragging the bottom bar to its first
// notch, that is, the gesture that returns to the start of the scene, therefore
// left the page burning one frame every 16 ms for as long as it was left open, and
// that on the two pages that are opened by touch for a whole rehearsal.
function centerTarget(card, el) {
  const rect = card.getBoundingClientRect();
  const wanted = el.scrollTop + rect.top + rect.height / 2 - el.clientHeight / 2;
  return Math.max(0, Math.min(wanted, el.scrollHeight - el.clientHeight));
}

function followStep(now) {
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
  // The second exit, the one that holds when the travel changes UNDER the loop
  // (the sticky header collapsed mid-gesture, a font that finishes loading): the
  // target being fixed for the duration of the step, a frame that has not moved by
  // a single pixel will not move any more on the next one. The clamping in
  // `centerTarget` is enough at the start of the gesture, this one catches it in
  // flight.
  if (el.scrollTop === before) {
    followFrame = 0;
    return;
  }
  followFrame = requestAnimationFrame(followStep);
}

function followCard(card, instant) {
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

// Keeps the list's `.dialogue-card.active` centred on screen whenever the
// selection changes (shared by the Rehearsal and Recording pages).
// `deps`: the indices whose change should trigger the re-centring.
export default function useScrollToActiveCard(listRef, deps) {
  useEffect(() => {
    const card = listRef.current?.querySelector(".dialogue-card.active");
    if (!card) return;
    // The rest of the site neutralises its animations under "reduced motion" (the
    // `prefers-reduced-motion` block of theme.css): a smoothed scroll is exactly
    // what that setting asks to remove, and it cannot be reached from CSS since it
    // comes from scrollIntoView.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (dragging) {
      // The flag is CONSUMED: a drag raises it again at every notch, so the
      // discrete jumps get their smoothing back by themselves if the end of the
      // gesture goes missing (pointer lost, handle disabled along the way).
      dragging = false;
      followCard(card, reduced);
      return;
    }
    // A discrete jump (click on the track, arrows of the bottom bar, keyboard,
    // playback moving on): the browser's smoothing, which is what it was put there
    // for. A follow loop still in flight would fight against it.
    if (followFrame) cancelAnimationFrame(followFrame);
    followFrame = 0;
    card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
