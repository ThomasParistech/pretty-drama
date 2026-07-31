import { useEffect, useState } from "react";

// Editing is the only computer-only page: one drags lines around with the mouse
// and types long texts on the keyboard. The criterion is the PRIMARY POINTER, not
// the width: a phone in landscape is 844 px wide (it would pass a width threshold)
// and stays unusable, whereas a shrunken computer window keeps mouse and keyboard,
// so it has no reason to be refused (the page's CSS already knows how to fold).
const TOUCH_QUERY = "(pointer: coarse)";

// Listened to and not merely read at mount: a hybrid can switch from finger to
// mouse (keyboard detached/reattached), and the device emulation of the developer
// tools changes the answer without reloading the page.
export default function useTouchPointer() {
  const [touch, setTouch] = useState(() => matches());

  useEffect(() => {
    const mq = mediaQuery();
    if (!mq) return;
    const onChange = (e) => setTouch(e.matches);
    mq.addEventListener("change", onChange);
    // The query may have changed between the first render and the subscription.
    setTouch(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return touch;
}

// Without matchMedia (very old browser, rendering outside a browser), we do not
// block: better a cramped editor than a page walled off by mistake.
function mediaQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(TOUCH_QUERY);
}

function matches() {
  return mediaQuery()?.matches ?? false;
}
