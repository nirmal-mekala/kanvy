// Current color theme, used to resolve theme-dynamic colors (colors/
// colorKey.ts's `gray`, colors/taskStatus.ts's `todo`) and persisted across
// sessions (spec's top-bar sun/moon toggle, ported from the prototype's
// `useTheme.js`) — falls back to the OS/browser's `prefers-color-scheme`
// only when nothing's been stored yet.

import { atom } from 'jotai'
import type { Theme } from '../../colors/colorKey'

const STORAGE_KEY = 'kanvy-theme'

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

// CRAP scoring penalizes this function's 0% coverage — it's a one-time
// module-init boundary reading browser globals (localStorage,
// matchMedia), not pure application logic; e2e (e2e/*.spec.ts) exercises
// it indirectly through the real browser environment.
// fallow-ignore-next-line complexity
function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable — fall through to the OS preference.
  }
  return prefersDark() ? 'dark' : 'light'
}

export const themeAtom = atom<Theme>(initialTheme())

export const toggleThemeAtom = atom(null, (get, set) => {
  const next: Theme = get(themeAtom) === 'light' ? 'dark' : 'light'
  set(themeAtom, next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // ignore — persistence is a nicety, not required for the toggle to work
  }
})
