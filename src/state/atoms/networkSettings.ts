// Network mode / settings state (network mode design doc §1/§2). Mode
// itself (`accessModeAtom`) stays in-memory only — it's derived fresh each
// load by attempting a connection with whatever config is persisted (see
// App.tsx's boot check), never read directly from storage — so switching
// mode never migrates data either direction. The connection config's base
// URL is persisted so that boot check has something to try; the auth token
// is persisted only when the user opts in via the settings modal's
// "persist token" checkbox (`persistTokenAtom`), since it's more sensitive
// than a URL. The backend preset (`dialectId`, ctx/notes/
// 261020-network-dialects.md) is persisted alongside the base URL.

import { atom } from 'jotai'
import { DEFAULT_DIALECT_ID, isDialectId } from '../../api/dialects/registry'

type AccessMode = 'local' | 'network'

export interface NetworkConfig {
  baseUrl: string
  authToken: string
  /** Which backend preset (api/dialects/registry.ts) speaks to `baseUrl`. */
  dialectId: string
}

/** No connection configured — the reset state, and the boot state when nothing is persisted. */
export const EMPTY_NETWORK_CONFIG: NetworkConfig = {
  baseUrl: '',
  authToken: '',
  dialectId: DEFAULT_DIALECT_ID,
}

const BASE_URL_KEY = 'kanvy-network-base-url'
const AUTH_TOKEN_KEY = 'kanvy-network-auth-token'
const DIALECT_KEY = 'kanvy-network-dialect'

/** A persisted dialect id, or the default when none was saved (a connection from before presets existed) or the saved one no longer exists. */
function persistedDialectId(saved: string | null): string {
  return saved !== null && isDialectId(saved) ? saved : DEFAULT_DIALECT_ID
}

// CRAP scoring penalizes this function's 0% coverage — it's a one-time
// module-init boundary reading localStorage, not pure application logic;
// e2e exercises it indirectly through the real browser environment.
// fallow-ignore-next-line complexity
function initialNetworkConfig(): NetworkConfig {
  try {
    return {
      baseUrl: localStorage.getItem(BASE_URL_KEY) ?? '',
      authToken: localStorage.getItem(AUTH_TOKEN_KEY) ?? '',
      dialectId: persistedDialectId(localStorage.getItem(DIALECT_KEY)),
    }
  } catch {
    return EMPTY_NETWORK_CONFIG
  }
}

function initialPersistToken(): boolean {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) !== null
  } catch {
    return false
  }
}

export const accessModeAtom = atom<AccessMode>('local')

const bootConfig = initialNetworkConfig()

export const networkConfigAtom = atom<NetworkConfig>(bootConfig)

/**
 * Whether App.tsx's boot-time reconnect attempt (a persisted base URL, if
 * any) has settled yet. Starts `'resolving'` only when there's something to
 * wait for — a persisted base URL — so local-only users see no change from
 * today's synchronous initial render. While `'resolving'`, App.tsx holds
 * off mounting the router entirely, so neither a stale local board nor an
 * unresolved-mode router decision (`boardRoute.beforeLoad`'s existence
 * check) can render/run before the reconnect attempt (success or failure)
 * has actually committed its result to `accessModeAtom`/`boardsAtom`.
 */
export const bootPhaseAtom = atom<'resolving' | 'ready'>(
  bootConfig.baseUrl ? 'resolving' : 'ready',
)

/** Whether the current auth token should be (or is) mirrored to localStorage — drives the settings modal's "persist token" checkbox default. */
export const persistTokenAtom = atom<boolean>(initialPersistToken())

/** Whether the settings modal is open — a shared atom rather than component-local state, since both the toolbar's cog button and the mode toggle's failed-connection path need to open the same modal instance. */
export const settingsModalOpenAtom = atom<boolean>(false)

/**
 * Persists (or clears) the connection config to localStorage. The base URL
 * and dialect are always saved; the auth token is saved only when `persistToken` is
 * true, and deleted otherwise — so toggling the checkbox off and
 * confirming removes any token a prior session may have persisted.
 * Silent-failure on a full/unavailable localStorage, matching this
 * codebase's other persistence (state/persistence/storage.ts's
 * `writeBoard`).
 */
export function writeNetworkAuthSettings(
  config: NetworkConfig,
  persistToken: boolean,
): void {
  try {
    if (config.baseUrl) {
      localStorage.setItem(BASE_URL_KEY, config.baseUrl)
      localStorage.setItem(DIALECT_KEY, config.dialectId)
    } else {
      localStorage.removeItem(BASE_URL_KEY)
      localStorage.removeItem(DIALECT_KEY)
    }
    if (persistToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, config.authToken)
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    // ignore — persistence is a nicety, not required for the app to work
  }
}

/**
 * Removes any persisted network settings (base URL, dialect, auth token) from
 * localStorage. Silent-failure on a full/unavailable localStorage, same
 * as `writeNetworkAuthSettings`. Does not touch in-memory state
 * (`networkConfigAtom`/`persistTokenAtom`) — callers update those atoms
 * themselves, same division of responsibility as `writeNetworkAuthSettings`.
 */
export function clearNetworkAuthSettings(): void {
  try {
    localStorage.removeItem(BASE_URL_KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(DIALECT_KEY)
  } catch {
    // ignore — persistence is a nicety, not required for the app to work
  }
}
