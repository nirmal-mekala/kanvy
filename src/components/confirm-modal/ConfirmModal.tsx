// Generic confirm-modal primitive (multiboard support design doc §4/§7) —
// nothing like this existed anywhere in the app before board delete/
// duplicate/paste needed a hard, blocking gate (not an act-then-toast
// pattern, decided explicitly in the design doc: the modal catches an
// accidental multi-select *before* it happens, which undo can't). Board
// delete/duplicate/paste (state/atoms/boards.ts, useClipboardShortcuts.ts)
// are the only callers today, but this component itself knows nothing
// about boards — it's a plain title/body/confirm/cancel dialog, mirroring
// HelpPanel.tsx's backdrop+dialog structure exactly (same
// Escape-to-dismiss, same "a real button standing in for the backdrop"
// trick for click-outside-to-dismiss).

import { useEffect } from 'react'

export interface ConfirmModalProps {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, onConfirm])

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* A real, keyboard-operable button standing in for the backdrop
          itself — same trick as help-panel.tsx's dismiss button — except
          this is a hard gate (design doc §4), so clicking outside cancels
          rather than silently confirming. */}
      <button
        type="button"
        className="modal-backdrop__dismiss"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal__title"
        aria-describedby={body ? 'confirm-modal__body' : undefined}
      >
        <h2 id="confirm-modal__title" className="confirm-modal__title">
          {title}
        </h2>
        {body && (
          <p id="confirm-modal__body" className="confirm-modal__body">
            {body}
          </p>
        )}
        <div className="confirm-modal__actions">
          <button
            type="button"
            className="confirm-modal__btn confirm-modal__btn--cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-modal__btn confirm-modal__btn--confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
