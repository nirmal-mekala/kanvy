// Transient, auto-dismissing notifications — the single surface for
// surfacing an error to the user (load failures, save failures, import
// failures): "something happened, here's a heads-up," expected to recur
// (e.g. a save failing under the TanStack Query mutation layer's
// simulated flaky network, src/api/boardApi.ts's `VITE_MOCK_ERROR_RATE`)
// without piling up UI the user has to individually dismiss.

import { atom } from 'jotai'

export interface Toast {
  id: string
  message: string
  /** Runs once, when this toast is dismissed (manually or via auto-dismiss) — e.g. acknowledging a corrupt-save recovery notice. */
  onDismiss?: () => void
}

export const toastsAtom = atom<Toast[]>([])

export const pushToastAtom = atom(
  null,
  (get, set, message: string, onDismiss?: () => void) => {
    const id = crypto.randomUUID()
    set(toastsAtom, [
      ...get(toastsAtom),
      { id, message, ...(onDismiss ? { onDismiss } : {}) },
    ])
    return id
  },
)

export const dismissToastAtom = atom(null, (get, set, id: string) => {
  const toast = get(toastsAtom).find((t) => t.id === id)
  toast?.onDismiss?.()
  set(
    toastsAtom,
    get(toastsAtom).filter((t) => t.id !== id),
  )
})
