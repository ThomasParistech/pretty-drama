import { useEffect, useState } from "react";

// Editing is computer-only. The criterion is the PRIMARY POINTER, not the width: a
// phone in landscape is 844 px and unusable, a shrunken window keeps mouse and keyboard.
const TOUCH_QUERY = "(pointer: coarse)";

// Listened to, not read once: a hybrid switches finger/mouse, and devtools emulation
// changes the answer without a reload.
export default function useTouchPointer() {
  const [touch, setTouch] = useState(() => matches());

  useEffect(() => {
    const mq = mediaQuery();
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener("change", onChange);
    // The query may have changed between the first render and the subscription.
    setTouch(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return touch;
}

// Without matchMedia, do not block: better a cramped editor than a page walled off
// by mistake.
function mediaQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(TOUCH_QUERY);
}

function matches() {
  return mediaQuery()?.matches ?? false;
}
