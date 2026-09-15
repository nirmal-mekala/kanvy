// Current color theme, used to resolve theme-dynamic colors (colors/
// colorKey.ts's `gray`, colors/taskStatus.ts's `todo`). Defaults from the
// OS/browser's `prefers-color-scheme` on first read. The toolbar's own
// light/dark toggle button (spec's top-bar sun/moon icon) is Stage 7's
// concern — this atom is the piece Stage 4's rendering needs in the
// meantime, not the full toggle UI.

import { atom } from 'jotai'
import type { Theme } from '../../colors/colorKey'

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export const themeAtom = atom<Theme>(prefersDark() ? 'dark' : 'light')
