import React, { useEffect, useState } from "react";
import ConfirmModal from "./ConfirmModal.tsx";
import { setBeforeUnloadGuard } from "./data.ts";
import { t } from "./locale.ts";
import type { ReactNode } from "react";

// Leaving a page whose work lives only in the tab (editor, recorder). Two layers
// because only one of them can be styled: site links get the themed modal, everything
// else (F5, typed URL, tab close) gets the browser's own `beforeunload` dialog.
export default function LeaveGuard({
  active,
  title,
  children,
  saveLabel,
  onSave,
}: {
  active: boolean;
  title: string;
  children?: ReactNode;
  saveLabel: string;
  onSave: () => void | Promise<void>;
}) {
  // Url of the clicked link, held pending while we wait for the answer.
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  useEffect(() => {
    setBeforeUnloadGuard(active);
    return () => setBeforeUnloadGuard(false);
  }, [active]);

  // Capture phase on the document, not link by link: future links are covered too.
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // Modified click asks for a new tab: we are not leaving.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link =
        e.target instanceof Element ? (e.target.closest("a[href]") as HTMLAnchorElement | null) : null;
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

  // The modal stays until the navigation, even when `active` drops back (the download
  // settles the page just before we leave it).
  if (!leaveTo) return null;

  // Drop the guard by hand rather than wait for its effect, or the native dialog
  // stacks on top of the modal.
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
        // Let the download start: unloading in the same task cancels it.
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
