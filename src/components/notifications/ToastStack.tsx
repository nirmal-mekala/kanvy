// Floating, auto-dismissing error notifications — see state/atoms/
// toasts.ts for why these are separate from Banner.tsx's persistent,
// manual-dismiss notifications. Rendered once in router.tsx's
// `RootLayout`, top-right (below the toolbar) so it doesn't collide with
// this app's other corner-anchored floating UI — `.board__zoom` (bottom-
// right), `.board__help` (bottom-left), and the dev-only TanStack Query
// Devtools toggle (nudged above `.board__zoom`, also bottom-right).

import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import {
  dismissToastAtom,
  type Toast,
  toastsAtom,
} from '../../state/atoms/toasts'

const AUTO_DISMISS_MS = 6000

function ToastRow({ id, message }: Toast) {
  const dismiss = useSetAtom(dismissToastAtom)

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [id, dismiss])

  return (
    <div className="toast" role="alert">
      <span className="toast__message">{message}</span>
      <button
        type="button"
        className="toast__dismiss"
        aria-label="Dismiss notification"
        onClick={() => dismiss(id)}
      >
        ×
      </button>
    </div>
  )
}

export function ToastStack() {
  const toasts = useAtomValue(toastsAtom)
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} {...toast} />
      ))}
    </div>
  )
}
