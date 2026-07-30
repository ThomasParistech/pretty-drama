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
// destructive one (« Télécharger puis quitter » face à « Quitter quand
// même ») ; it then takes the focus, being the one to offer by default.
export default function ConfirmModal({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  primaryLabel,
  onPrimary,
}) {
  const confirmRef = useRef(null);
  const primaryRef = useRef(null);

  useEffect(() => (primaryRef.current ?? confirmRef.current)?.focus(), []);

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
          <button className="btn danger" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
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
