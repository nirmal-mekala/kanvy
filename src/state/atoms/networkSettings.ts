// Network mode / settings state (network mode design doc §1/§2) — in-memory
// only, deliberately: no localStorage key for any of this, so switching
// mode never migrates data either direction and a reload always resets to
// local-mode defaults. Only ever changed by the settings modal's Confirm
// button, which tests the connection first (see api/restClient.ts's
// `testConnection`) — nothing here is written to on every keystroke.

import { atom } from 'jotai'

export type AccessMode = 'local' | 'network'

export interface NetworkConfig {
  baseUrl: string
  authToken: string
}

export const accessModeAtom = atom<AccessMode>('local')

export const networkConfigAtom = atom<NetworkConfig>({
  baseUrl: '',
  authToken: '',
})
