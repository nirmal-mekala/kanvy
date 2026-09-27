// Floating, auto-dismissing notifications — see state/atoms/toasts.ts.
// Rendered once in router.tsx's `RootLayout`, top-right (below the
// toolbar) so it doesn't collide with
// this app's other corner-anchored floating UI — `.board__zoom` (bottom-
// right), `.board__help` (bottom-left), and the dev-only TanStack Query
// Devtools toggle (nudged above `.board__zoom`, also bottom-right).
//
// Reads `toastsAtom` via `useAtomValueRawSync` (a `useSyncExternalStore`-
// based subscription), not the library's default `useAtomValue` (which
// subscribes in its own `useEffect`, plain `useReducer`-backed): several
// of this component's sibling notices (RecoveryNotice, NetworkErrorNotice)
// push a toast from *their own* mount-time `useEffect`, and React fires
// passive effects across sibling components in mount/JSX order within one
// commit. Since those notices render before this component in
// `RootLayout`, their push could — and did (see the regression test) —
// fire before this component's own subscribe-effect had been set up,
// silently dropping that first push forever (a later push would still
// show correctly, just not the missed one). `useSyncExternalStore`
// subscribes and re-checks synchronously around the commit rather than in
// a same-priority passive effect, so it can't lose an update to this kind
// of ordering race regardless of where this component sits in the tree.

import { useSetAtom } from 'jotai'
import { useAtomValueRawSync } from 'jotai/react'
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
  const toasts = useAtomValueRawSync(toastsAtom)
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} {...toast} />
      ))}
    </div>
  )
}
