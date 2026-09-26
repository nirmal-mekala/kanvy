// Local/Network mode toggle (bottom bar, centered between the help button
// and zoom controls — see Canvas.tsx) — a single sliding switch, not two
// separate buttons: one click flips the mode, the thumb animates to the
// other side, and its icon swaps to match. Local→Network tests the
// connection first, same as the settings modal's Confirm; Network→Local is
// immediate, no test needed. A failed test, or no base URL configured at
// all, opens the settings modal (settingsModalOpenAtom) rather than
// leaving the user stuck — the settings modal is now connection-details-
// only, this toggle is the only place mode actually switches.

import { useAtom, useSetAtom } from 'jotai'
import { HardDrive, Wifi } from 'lucide-react'
import { useState } from 'react'
import { testConnection } from '../../api/restClient'
import {
  accessModeAtom,
  networkConfigAtom,
  settingsModalOpenAtom,
} from '../../state/atoms/networkSettings'
import { pushToastAtom } from '../../state/atoms/toasts'
import {
  initializeNetworkMode,
  switchToLocalMode,
} from '../../state/networkBoardLoader'

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from e2e,
// same precedent as Toolbar/SettingsModal/Canvas.
// fallow-ignore-next-line complexity
export function ModeToggle() {
  const [accessMode, setAccessMode] = useAtom(accessModeAtom)
  const [networkConfig] = useAtom(networkConfigAtom)
  const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
  const pushToast = useSetAtom(pushToastAtom)
  const [connecting, setConnecting] = useState(false)

  function handleToggle() {
    if (connecting) return

    if (accessMode === 'network') {
      switchToLocalMode()
      setAccessMode('local')
      return
    }

    if (!networkConfig.baseUrl) {
      setSettingsOpen(true)
      return
    }

    setConnecting(true)
    testConnection(networkConfig)
      .then(async () => {
        setAccessMode('network')
        await initializeNetworkMode(networkConfig)
      })
      .catch(() => {
        pushToast('Could not connect — check your connection settings.')
        setSettingsOpen(true)
      })
      .finally(() => setConnecting(false))
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={accessMode === 'network'}
      className="board__mode-toggle"
      onClick={handleToggle}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={connecting}
      title={
        accessMode === 'network'
          ? 'Switch to Local mode'
          : 'Switch to Network mode'
      }
    >
      <span className="board__mode-toggle__thumb">
        {accessMode === 'network' ? (
          <Wifi size={16} strokeWidth={2} />
        ) : (
          <HardDrive size={16} strokeWidth={2} />
        )}
      </span>
    </button>
  )
}
