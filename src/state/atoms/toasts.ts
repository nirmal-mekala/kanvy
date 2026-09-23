// Transient, auto-dismissing error notifications — distinct from
// notifications/Banner.tsx's persistent, manual-dismiss-only banners
// (corrupt-save recovery, import failure): those are "you should
// definitely see this and act on it," rendered once, in-flow. A toast is
// for "something happened, here's a heads-up" — expected to recur (e.g.
// a save failing under the TanStack Query mutation layer's simulated
// flaky network, src/api/boardApi.ts's `VITE_MOCK_ERROR_RATE`) without
// piling up banners the user has to individually dismiss.

import { atom } from 'jotai'

export interface Toast {
  id: string
  message: string
}

export const toastsAtom = atom<Toast[]>([])

export const pushToastAtom = atom(null, (get, set, message: string) => {
  const id = crypto.randomUUID()
  set(toastsAtom, [...get(toastsAtom), { id, message }])
  return id
})

export const dismissToastAtom = atom(null, (get, set, id: string) => {
  set(
    toastsAtom,
    get(toastsAtom).filter((toast) => toast.id !== id),
  )
})
