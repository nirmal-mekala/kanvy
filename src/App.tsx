// Boots the app: theme wiring (global, mounted once regardless of route),
// then hands off to the TanStack Router tree (router.tsx) — whose root
// layout owns the toolbar (Stage 7), the corrupt-save recovery banner
// (Stage 9, spec §9/Q12), and per-board routing (multiboard support,
// ctx/notes/260917-multiboard-support-design.md §6). Board load already
// fell back to the seed board on corrupt data (see
// state/persistence/storage.ts); dismissing the banner is the
// acknowledgement that resumes autosave (`recoveryAcknowledgedAtom`).

import { RouterProvider } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { router } from './router'
import { themeAtom } from './state/atoms/theme'

function App() {
  const theme = useAtomValue(themeAtom)

  // Matches the prototype's useTheme.js: the theme lives on <html>'s
  // data-theme attribute, so index.css's `[data-theme='dark']` override
  // cascades to every component regardless of DOM depth.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return <RouterProvider router={router} />
}

export default App
