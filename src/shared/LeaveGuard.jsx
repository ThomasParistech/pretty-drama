import React, { useEffect, useState } from "react";
import ConfirmModal from "./ConfirmModal.jsx";
import { setBeforeUnloadGuard } from "./data.js";
import { t } from "./locale.js";

// Leaving a page that holds work living only in the tab: the editor (script not
// downloaded) and the recording page (takes outside any ZIP).
//
// Two layers, because the browser lets only one of them be styled:
//  - a site link: click intercepted here, themed modal, which can moreover
//    offer to download before leaving;
//  - a reload, a typed URL, a bookmark, closing the tab: only `beforeunload`
//    reacts, and its dialog belongs to the browser (message and style imposed
//    since Chrome 51 / Firefox 44). We keep it as a safety net: without it, an
//    F5 would lose the work without a word.
//
// Nothing is ever persisted locally: a draft forgotten in a browser would
// become a stale source of truth again, facing the repository.
export default function LeaveGuard({ active, title, children, saveLabel, onSave }) {
  // Url of the clicked link, held pending while we wait for the answer.
  const [leaveTo, setLeaveTo] = useState(null);

  useEffect(() => {
    setBeforeUnloadGuard(active);
    return () => setBeforeUnloadGuard(false);
  }, [active]);

  // Listening on the document in the capture phase rather than wiring link by
  // link: future links are covered as a matter of course.
  useEffect(() => {
    if (!active) return;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // Modified click: the user is asking for a new tab, we are not leaving.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      // Internal anchor: no navigation, nothing to lose.
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) {
        return;
      }
      e.preventDefault();
      setLeaveTo(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  // The modal stays on screen until the navigation, even when `active` drops
  // back (the download settles the page just before we leave it).
  if (!leaveTo) return null;

  // Leaving for good: we remove the guard by hand instead of waiting for its
  // effect, otherwise the native dialog stacks on top of the modal.
  const leaveNow = () => {
    setBeforeUnloadGuard(false);
    window.location.href = leaveTo;
  };

  return (
    <ConfirmModal
      title={title}
      primaryLabel={saveLabel}
      onPrimary={async () => {
        await onSave();
        // Let the browser start the download: unloading the page in the same
        // task can cancel it.
        window.setTimeout(leaveNow, 200);
      }}
      confirmLabel={t("common.leaveAnyway")}
      onConfirm={leaveNow}
      onCancel={() => setLeaveTo(null)}
    >
      {children}
    </ConfirmModal>
  );
}
