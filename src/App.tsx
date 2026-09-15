// Boots the app: the full toolbar (Stage 7 — theme toggle/import/export/
// view-mode menu), the corrupt-save recovery banner (Stage 9, spec
// §9/Q12), and the canvas (Stage 4). Board load already fell back to the
// seed board on corrupt data (see state/persistence/storage.ts); dismissing
// the banner is the acknowledgement that resumes autosave
// (`recoveryAcknowledgedAtom`).

import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { Canvas } from './components/canvas/Canvas'
import { RecoveryBanner } from './components/notifications/RecoveryBanner'
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
      <RecoveryBanner />
      <Toolbar />
      <Canvas />
    </div>
  )
}

export default App
