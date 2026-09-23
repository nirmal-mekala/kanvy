// Local/Network settings modal (network mode design doc §2) — mirrors
// ConfirmModal.tsx's backdrop+dialog structure (Escape to dismiss, a real
// button standing in for the backdrop). Nothing here touches app state
// until Confirm is pressed: the toggle/fields are pure local draft state,
// and Confirm only applies the draft after a successful connection test
// (network mode only — switching to/staying on Local applies immediately,
// there's nothing to test).

import { useAtom, useAtomValue } from 'jotai'
import { Cloud, HardDrive } from 'lucide-react'
import { useEffect, useState } from 'react'
import { testConnection } from '../../api/restClient'
import {
  type AccessMode,
  accessModeAtom,
  networkConfigAtom,
} from '../../state/atoms/networkSettings'
import {
  initializeNetworkMode,
  networkHomeLoadingAtom,
  switchToLocalMode,
} from '../../state/networkBoardLoader'

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from
// e2e/settingsNetworkMode.spec.ts, same precedent as Toolbar/CardBody/
// Container/Canvas.
// fallow-ignore-next-line complexity
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [accessMode, setAccessMode] = useAtom(accessModeAtom)
  const [networkConfig, setNetworkConfig] = useAtom(networkConfigAtom)

  const [draftMode, setDraftMode] = useState<AccessMode>(accessMode)
  const [draftBaseUrl, setDraftBaseUrl] = useState(networkConfig.baseUrl)
  const [draftAuthToken, setDraftAuthToken] = useState(networkConfig.authToken)
  const [testing, setTesting] = useState(false)
  const homeLoading = useAtomValue(networkHomeLoadingAtom)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleConfirm() {
    if (draftMode === 'local') {
      // Only a real transition needs to reload from localStorage/reset
      // network tracking — reconfirming Local while already Local is a
      // no-op past closing the modal.
      if (accessMode !== 'local') switchToLocalMode()
      setAccessMode('local')
      onClose()
      return
    }
    setTesting(true)
    setError(undefined)
    const config = { baseUrl: draftBaseUrl, authToken: draftAuthToken }
    try {
      await testConnection(config)
      setAccessMode('network')
      setNetworkConfig(config)
      // The blocking home-board load (design doc §6a) — deliberately
      // still inside this same try/catch as the connection test, so a
      // failure here surfaces the same inline modal error rather than
      // closing the modal on a mode that then has no data.
      await initializeNetworkMode(config)
      onClose()
    } catch {
      setError('Could not connect — check the base URL and try again.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div
      className="modal-backdrop settings-backdrop"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="modal-backdrop__dismiss"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal__title"
      >
        <h2 id="settings-modal__title" className="settings-modal__title">
          Settings
        </h2>

        <div className="settings-modal__toggle">
          <button
            type="button"
            aria-pressed={draftMode === 'local'}
            className={`settings-modal__toggle-btn${draftMode === 'local' ? ' settings-modal__toggle-btn--active' : ''}`}
            onClick={() => setDraftMode('local')}
          >
            <HardDrive size={16} strokeWidth={2} />
            Local
          </button>
          <button
            type="button"
            aria-pressed={draftMode === 'network'}
            className={`settings-modal__toggle-btn${draftMode === 'network' ? ' settings-modal__toggle-btn--active' : ''}`}
            onClick={() => setDraftMode('network')}
          >
            <Cloud size={16} strokeWidth={2} />
            Network
          </button>
        </div>

        {draftMode === 'network' && (
          <div className="settings-modal__fields">
            <label className="settings-modal__field">
              <span className="settings-modal__label">Base URL</span>
              <input
                type="text"
                className="settings-modal__input"
                placeholder="http://localhost:1996"
                value={draftBaseUrl}
                onChange={(e) => setDraftBaseUrl(e.target.value)}
              />
            </label>
            <label className="settings-modal__field">
              <span className="settings-modal__label">
                Auth token (optional)
              </span>
              <input
                type="text"
                className="settings-modal__input"
                placeholder="Sent as Authorization: Bearer <token>"
                value={draftAuthToken}
                onChange={(e) => setDraftAuthToken(e.target.value)}
              />
            </label>
          </div>
        )}

        {error && <p className="settings-modal__error">{error}</p>}

        <div className="settings-modal__actions">
          <button
            type="button"
            className="confirm-modal__btn confirm-modal__btn--cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-modal__btn confirm-modal__btn--confirm"
            onClick={handleConfirm}
            disabled={testing || (draftMode === 'network' && !draftBaseUrl)}
          >
            {homeLoading ? 'Loading board…' : testing ? 'Testing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
