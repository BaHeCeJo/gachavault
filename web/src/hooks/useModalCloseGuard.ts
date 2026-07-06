"use client";

import { useCallback, useEffect, useState } from "react";

// Guards the close of a hand-rolled admin editor modal so an accidental
// backdrop click / Escape doesn't silently discard a half-filled form.
//
// The pages here open a `<div className="fixed inset-0 …" onClick={close}>`
// overlay. Wiring `requestClose` into the backdrop, the Cancel button and
// Escape means:
//   - if the form is untouched (`dirty === false`) → close immediately
//   - if the form has unsaved edits → surface a confirm dialog first
//
// `dirty` is computed by the caller (usually a snapshot compare of the form
// against its initial value on open), so an empty just-opened form never
// nags on close.
//
// Usage:
//   const closeModal = useCallback(() => setModal(null), []);
//   const dirty = !!modal && JSON.stringify(form) !== JSON.stringify(initialForm);
//   const guard = useModalCloseGuard({ open: !!modal, dirty, onClose: closeModal });
//   ...
//   <div className="fixed inset-0 …" onClick={guard.requestClose}> … </div>
//   <ConfirmDialog open={guard.confirming} … onConfirm={guard.confirmClose}
//     onCancel={guard.cancelClose} />
export function useModalCloseGuard(opts: {
  open: boolean;
  dirty: boolean;
  onClose: () => void;
}) {
  const { open, dirty, onClose } = opts;
  const [confirming, setConfirming] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);

  const confirmClose = useCallback(() => {
    setConfirming(false);
    onClose();
  }, [onClose]);

  const cancelClose = useCallback(() => setConfirming(false), []);

  // Close on Escape — the overlay is a plain div, so it has no built-in key
  // handling. Skip while the confirm dialog is up (Radix owns Escape there),
  // otherwise a single Escape would both dismiss the confirm and re-trigger it.
  useEffect(() => {
    if (!open || confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirming, requestClose]);

  // Never leave the confirm dialog mounted once the modal itself is gone.
  useEffect(() => {
    if (!open && confirming) setConfirming(false);
  }, [open, confirming]);

  return { requestClose, confirming, confirmClose, cancelClose };
}
