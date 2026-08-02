import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "./locale.js";

// Themed replacement for window.confirm.
// PORTAL because the caller can sit inside a dnd-kit transform, which would become the
// containing block of the fixed backdrop and trap it inside the row.
// `primaryLabel`/`onPrimary`: optional safe way out beside the destructive one, and it
// takes the focus. `confirmLabel` is optional too: a box may carry no destructive
// gesture at all.
// `bodyTakesFocus` for the one box that is a FORM: its field has `autoFocus`, and this
// component's effect runs after its children's and would steal it back.
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

  // Capture phase: the editor also listens on window (Ctrl+Z) and a textarea may
  // still be focused.
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
