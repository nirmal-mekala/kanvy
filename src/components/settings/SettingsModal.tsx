// Connection-details settings modal (network mode design doc §2, later
// narrowed — mode switching itself now lives in the canvas's mode toggle,
// components/canvas/ModeToggle.tsx). Built on the shared Modal primitive
// (../modal/Modal.tsx), same as ConfirmModal.tsx. Nothing here touches app
// state until Confirm is pressed: the fields/checkbox are pure local draft
// state, and Confirm only applies the draft after a successful connection
// test — same "Save & Connect" behavior the modal always had, just without
// its own Local/Network buttons. The Backend dropdown picks the connection's
// dialect preset (api/dialects/registry.ts, ctx/notes/
// 261020-network-dialects.md).

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { DIALECTS, getDialect } from '../../api/dialects/registry'
import { testConnection } from '../../api/restClient'
import { ResponseValidationError } from '../../api/validateEntries'
import {
  accessModeAtom,
  clearNetworkAuthSettings,
  EMPTY_NETWORK_CONFIG,
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
import { Modal } from '../modal/Modal'
import { FieldMessage } from './FieldMessage'

/**
 * The inline error for a failed Confirm. A schema mismatch (e.g. a
 * `boards` entry missing `isRoot`) is a data problem on a server that
 * *was* reachable — say exactly what's wrong rather than the generic
 * connection message. Anything else names the backend preset too, since
 * the wrong preset for a reachable server fails the same way.
 */
function confirmErrorMessage(error: unknown): string {
  return error instanceof ResponseValidationError
    ? `The server's data doesn't match this app's schema — ${error.message}`
    : 'Could not connect — check the backend, base URL and token, and try again.'
}

/** The per-backend setup tip under the fields. */
function DialectTip({ dialectId }: { dialectId: string }) {
  if (dialectId === 'postgrest') {
    return (
      <FieldMessage tone="tip">
        Expects <code>boards</code>, <code>nodes</code>, <code>edges</code> and{' '}
        <code>images</code> tables with snake_case columns. The token is sent as
        the PostgREST JWT.
      </FieldMessage>
    )
  }
  return (
    <FieldMessage tone="tip">
      The board JSON downloaded from the toolbar can be served directly as a
      json-server db file: <code>npx json-server &lt;file&gt;</code>.
    </FieldMessage>
  )
}

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

  const [draftDialectId, setDraftDialectId] = useState(networkConfig.dialectId)
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
    const config = {
      baseUrl: draftBaseUrl,
      authToken: draftAuthToken,
      dialectId: draftDialectId,
    }
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
    } catch (caught) {
      setError(confirmErrorMessage(caught))
    } finally {
      setTesting(false)
    }
  }

  function handleClearNetworkSettings() {
    if (accessMode === 'network') {
      switchToLocalMode()
      setAccessMode('local')
    }
    clearNetworkAuthSettings()
    setNetworkConfig(EMPTY_NETWORK_CONFIG)
    setPersistToken(false)
    setDraftDialectId(EMPTY_NETWORK_CONFIG.dialectId)
    setDraftBaseUrl('')
    setDraftAuthToken('')
    setDraftPersistToken(false)
    onClose()
  }

  return (
    <Modal
      title="Connection settings"
      titleId="settings-modal__title"
      onDismiss={onClose}
      onConfirm={handleConfirm}
      dismissLabel="Close settings"
      dialogClassName="settings-modal"
      backdropClassName="settings-backdrop"
    >
      <div className="settings-modal__fields">
        <label className="settings-modal__field">
          <span className="settings-modal__label">Backend</span>
          <select
            className="settings-modal__input"
            value={draftDialectId}
            onChange={(e) => setDraftDialectId(e.target.value)}
          >
            {DIALECTS.map((dialect) => (
              <option key={dialect.id} value={dialect.id}>
                {dialect.label}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-modal__field">
          <span className="settings-modal__label">Base URL</span>
          <input
            type="text"
            className="settings-modal__input"
            placeholder={getDialect(draftDialectId).exampleBaseUrl}
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
          <span>Dangerously persist token to this browser's local storage</span>
        </label>
        {draftPersistToken && (
          <FieldMessage tone="warning">
            The token will be stored in plaintext in this browser's local
            storage. Anyone with access to this device/browser could read it.
          </FieldMessage>
        )}
        <DialectTip dialectId={draftDialectId} />
      </div>

      {error && <FieldMessage tone="error">{error}</FieldMessage>}

      <div className="settings-modal__actions">
        <button
          type="button"
          className="confirm-modal__btn confirm-modal__btn--confirm"
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
    </Modal>
  )
}
