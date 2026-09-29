// Generic confirm-modal primitive (multiboard support design doc §4/§7) —
// nothing like this existed anywhere in the app before board delete/
// duplicate/paste needed a hard, blocking gate (not an act-then-toast
// pattern, decided explicitly in the design doc: the modal catches an
// accidental multi-select *before* it happens, which undo can't). Board
// delete/duplicate/paste (state/atoms/boards.ts, useClipboardShortcuts.ts)
// are the only callers today, but this component itself knows nothing
// about boards — it's a plain title/body/confirm/cancel dialog, built on
// the shared Modal primitive (../modal/Modal.tsx).

import { Modal } from '../modal/Modal'

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
  return (
    <Modal
      title={title}
      titleId="confirm-modal__title"
      descriptionId={body ? 'confirm-modal__body' : undefined}
      onDismiss={onCancel}
      onConfirm={onConfirm}
      dismissLabel={cancelLabel}
      role="alertdialog"
      dialogClassName="confirm-modal"
      backdropClassName="confirm-backdrop"
      size="compact"
    >
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
    </Modal>
  )
}
