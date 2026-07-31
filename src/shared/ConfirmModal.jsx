import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "./locale.js";

// Confirmation for a destructive edit, in place of window.confirm (a raw
// browser dialog, off-theme and unstyleable). Same look as the character
// deletion modal: shared .modal-backdrop / .modal from theme.css.
//
// Rendered through a portal: the caller can sit inside a dnd-kit transform
// (a line row being sorted), which would become the containing block of the
// fixed-position backdrop and trap it inside the row.
//
// `primaryLabel`/`onPrimary` add an optional safe way out next to the
// destructive one ("Download, then leave" facing "Leave anyway"); it then
// takes the focus, being the one to offer by default.
//
// `confirmLabel` is optional for the symmetrical reason: a box can carry no
// destructive gesture at all, only something to go on with ("Continue" on the
// Editing page, once the script.json is on the disk and GitHub is about to open).
// Cancel stays, it is the way of declining, and so do Escape, the backdrop, the
// focus and the portal: an informational box that reimplemented them by hand would
// differ from the others on all four (which is exactly what happened to the
// character deletion, see DeleteCharacterModal).
//
// `bodyTakesFocus` is for the one box that is not a question but a FORM (creating a
// play): its body carries a field, the field carries `autoFocus`, and this component's
// own effect would take that focus away right afterwards, a parent's effect running
// after its children have mounted. So the box focuses no button and lets the body keep
// what it was given. Everything else it provides is exactly what such a form needs and
// would otherwise be written by hand: Escape, the backdrop, the portal.
export default function ConfirmModal({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  primaryLabel,
  onPrimary,
  bodyTakesFocus = false,
}) {
  const confirmRef = useRef(null);
  const primaryRef = useRef(null);

  useEffect(() => {
    if (bodyTakesFocus) return;
    (primaryRef.current ?? confirmRef.current)?.focus();
  }, [bodyTakesFocus]);

  // Escape closes, like a native dialog. Capture phase: the editor also
  // listens for keys on window (Ctrl+Z), and a textarea may still be focused.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {children}
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          {confirmLabel && (
            <button className="btn danger" ref={confirmRef} onClick={onConfirm}>
              {confirmLabel}
            </button>
          )}
          {primaryLabel && (
            <button className="btn primary" ref={primaryRef} onClick={onPrimary}>
              {primaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
