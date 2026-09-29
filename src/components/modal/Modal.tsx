// Shared backdrop+dialog primitive for every full-screen modal (help
// panel, confirm modal, settings modal) — factored out so they share a
// single Escape/Enter keydown handler, backdrop-dismiss-button trick, and
// heading markup, rather than each reimplementing the same structure with
// small drifts (see ctx/notes for the help-panel positioning bug this
// consolidation also fixes).
//
// Portaled to `document.body` (not rendered in place) so a modal opened
// from inside a small, non-full-width ancestor — e.g. the `?` button's
// `.board__bottom-bar` row — never inherits that ancestor's box as its
// `position: fixed` containing block. `position: fixed` (not `absolute`)
// is what actually makes this safe: an `absolute`, `inset: 0` backdrop
// still sizes itself against its nearest *positioned* ancestor even when
// portaled, since portaling only moves DOM placement, not the CSS
// containing-block chain for a non-fixed position.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface ModalProps {
  title: string
  titleId: string
  descriptionId?: string
  onDismiss: () => void
  onConfirm?: () => void
  dismissLabel: string
  role?: 'dialog' | 'alertdialog'
  dialogClassName: string
  backdropClassName?: string
  /** Extra class appended to the title `<h2>`, alongside its shared
   * `modal-dialog__title` class — e.g. `confirm-modal__title` — so
   * per-modal e2e/CSS hooks keep working without each modal reimplementing
   * the heading markup itself. */
  titleClassName?: string
  /** `standard` (default): the app's one fixed full-dialog size (help
   * panel, settings modal). `compact`: a smaller, content-sized footprint
   * for quick yes/no confirmations (confirm modal) — the app has exactly
   * these two dialog sizes, not one per modal. */
  size?: 'standard' | 'compact'
  children: React.ReactNode
}

export function Modal({
  title,
  titleId,
  descriptionId,
  onDismiss,
  onConfirm,
  dismissLabel,
  role = 'dialog',
  dialogClassName,
  backdropClassName,
  titleClassName,
  size = 'standard',
  children,
}: ModalProps) {
  // Re-registered every render (cheap) so Escape/Enter always close over
  // the latest onDismiss/onConfirm.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
      if (e.key === 'Enter') onConfirm?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return createPortal(
    <div
      className={
        backdropClassName
          ? `modal-backdrop ${backdropClassName}`
          : 'modal-backdrop'
      }
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* A real, keyboard-operable button standing in for the backdrop
          itself — clicking (or Enter/Space-activating) anywhere outside
          the dialog dismisses it, same as Escape. */}
      <button
        type="button"
        className="modal-backdrop__dismiss"
        aria-label={dismissLabel}
        onClick={onDismiss}
      />
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is dynamic (dialog | alertdialog) but aria-modal is valid on both — the rule can't see that statically. */}
      <div
        className={`modal-dialog modal-dialog--${size} ${dialogClassName}`}
        role={role}
        aria-modal="true"
        aria-label={title}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2
          id={titleId}
          className={
            titleClassName
              ? `modal-dialog__title ${titleClassName}`
              : 'modal-dialog__title'
          }
        >
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
