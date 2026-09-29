// Connection-details settings modal (network mode design doc §2, later
// narrowed — mode switching itself now lives in the canvas's mode toggle,
// components/canvas/ModeToggle.tsx). Mirrors ConfirmModal.tsx's
// backdrop+dialog structure (Escape to dismiss, a real button standing in
// for the backdrop). Nothing here touches app state until Confirm is
// pressed: the fields/checkbox are pure local draft state, and Confirm
// only applies the draft after a successful connection test — same
// "Save & Connect" behavior the modal always had, just without its own
// Local/Network buttons.

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { testConnection } from '../../api/restClient'
import {
  accessModeAtom,
  clearNetworkAuthSettings,
  networkConfigAtom,
  persistTokenAtom,
  settingsModalOpenAtom,
  writeNetworkAuthSettings,
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
export function SettingsModal() {
  const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
  const onClose = () => setSettingsOpen(false)

  const [accessMode, setAccessMode] = useAtom(accessModeAtom)
  const [networkConfig, setNetworkConfig] = useAtom(networkConfigAtom)
  const [persistToken, setPersistToken] = useAtom(persistTokenAtom)

  const [draftBaseUrl, setDraftBaseUrl] = useState(networkConfig.baseUrl)
  const [draftAuthToken, setDraftAuthToken] = useState(networkConfig.authToken)
  const [draftPersistToken, setDraftPersistToken] = useState(persistToken)
  const [testing, setTesting] = useState(false)
  const homeLoading = useAtomValue(networkHomeLoadingAtom)
  const [error, setError] = useState<string | undefined>(undefined)

  async function handleConfirm() {
    if (testing || !draftBaseUrl) return
    setTesting(true)
    setError(undefined)
    const config = { baseUrl: draftBaseUrl, authToken: draftAuthToken }
    try {
      await testConnection(config)
      setAccessMode('network')
      setNetworkConfig(config)
      setPersistToken(draftPersistToken)
      writeNetworkAuthSettings(config, draftPersistToken)
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

  // Re-registered every render (cheap) so Escape/Enter always close over
  // the latest onClose/handleConfirm — same as ConfirmModal.tsx's own
  // keydown effect, which does the same for the same reason.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') handleConfirm()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function handleClearNetworkSettings() {
    if (accessMode === 'network') {
      switchToLocalMode()
      setAccessMode('local')
    }
    clearNetworkAuthSettings()
    setNetworkConfig({ baseUrl: '', authToken: '' })
    setPersistToken(false)
    setDraftBaseUrl('')
    setDraftAuthToken('')
    setDraftPersistToken(false)
    onClose()
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
          Connection settings
        </h2>

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
            <span className="settings-modal__label">Auth token (optional)</span>
            <input
              type="text"
              className="settings-modal__input"
              placeholder="Sent as Authorization: Bearer <token>"
              value={draftAuthToken}
              onChange={(e) => setDraftAuthToken(e.target.value)}
            />
          </label>
          <label className="settings-modal__checkbox-field">
            <input
              type="checkbox"
              checked={draftPersistToken}
              onChange={(e) => setDraftPersistToken(e.target.checked)}
            />
            <span>Persist token to this browser's local storage</span>
          </label>
          {draftPersistToken && (
            <p className="settings-modal__warning">
              The token will be stored in plaintext in this browser's local
              storage. Anyone with access to this device/browser could read it.
            </p>
          )}
        </div>

        {error && <p className="settings-modal__error">{error}</p>}

        <div className="settings-modal__actions">
          <button
            type="button"
            className="confirm-modal__btn settings-modal__clear-btn"
            onClick={handleClearNetworkSettings}
          >
            Clear Network Settings
          </button>
          <div className="settings-modal__actions-group">
            <button
              type="button"
              className="confirm-modal__btn confirm-modal__btn--cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="confirm-modal__btn confirm-modal__btn--positive"
              onClick={handleConfirm}
              disabled={testing || !draftBaseUrl}
            >
              {homeLoading
                ? 'Loading board…'
                : testing
                  ? 'Testing…'
                  : 'Save & Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
