// Which "lens" the board is viewed through (spec §6.2) — persisted across
// sessions, ported from the prototype's `useViewMode.js`. Selected from the
// toolbar's eye-icon menu (Stage 7); the render-side differences this
// drives (border-color resolution, container-pattern suppression) already
// live in colors/borderColor.ts and the Card/Container components.

import { atom } from 'jotai'
import type { ViewMode } from '../../colors/borderColor'

const STORAGE_KEY = 'kanvy-view-mode'
const VIEW_MODES: readonly ViewMode[] = ['standard', 'task', 'recency']

function isViewMode(value: string | null): value is ViewMode {
  return value !== null && (VIEW_MODES as readonly string[]).includes(value)
}

function initialViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isViewMode(stored)) return stored
  } catch {
    // localStorage unavailable — fall back to the default.
  }
  return 'standard'
}

export const viewModeAtom = atom<ViewMode>(initialViewMode())

export const setViewModeAtom = atom(null, (_get, set, mode: ViewMode) => {
  set(viewModeAtom, mode)
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore — persistence is a nicety, not required for the switch to work
  }
})
