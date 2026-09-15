// Boots the app: the full toolbar (Stage 7 — theme toggle/import/export/
// view-mode menu) and the canvas (Stage 4). Board load already fell back
// to the seed board on corrupt data (see state/persistence/storage.ts);
// the visible "recovery happened" notification spec §9/Q12 requires is
// Stage 9's job — this stage just doesn't crash or clobber the bad data
// (autosave stays gated on `recoveryAcknowledgedAtom` until then).

import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { Canvas } from './components/canvas/Canvas'
import { Toolbar } from './components/toolbar/Toolbar'
import { themeAtom } from './state/atoms/theme'

function App() {
  const theme = useAtomValue(themeAtom)

  // Matches the prototype's useTheme.js: the theme lives on <html>'s
  // data-theme attribute, so index.css's `[data-theme='dark']` override
  // cascades to every component regardless of DOM depth.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="app">
      <Toolbar />
      <Canvas />
    </div>
  )
}

export default App
