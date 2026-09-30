// Cross-mode board-id resolution for direct navigation (router.tsx's
// `boardRoute.beforeLoad`). Spans both Local and Network mode, so it lives
// apart from networkBoardLoader.ts (scoped to "network mode's read path" —
// see its own module comment).
//
// A board id not found in the *current* mode is not necessarily gone —
// it may simply belong to the other mode's storage (e.g. a bookmarked
// local board visited while a network session is active, or a link on a
// local board pointing at a board that only exists on the network backend
// this app happens to have valid settings for). When that's the case, this
// performs a full mode switch for the whole app — not a one-off render
// exception — so that "home" and everything else the user does afterward
// is consistent with the mode that board actually came from. This is a
// deliberate nuance to "ships in the night" (network mode design doc §1):
// mode only ever changes on an explicit success (the board was actually
// found in the other mode), never partially or speculatively.

import { getDefaultStore } from 'jotai'
import { testConnection } from '../api/restClient'
import { boardsAtom } from './atoms/boards'
import { accessModeAtom, networkConfigAtom } from './atoms/networkSettings'
import { initializeNetworkMode, switchToLocalMode } from './networkBoardLoader'
import { loadBoard } from './persistence/storage'

export type BoardAccessResult = 'ok' | 'not-found'

function existsIn(
  boards: readonly { id: string; status: string }[],
  boardId: string,
): boolean {
  return boards.some(
    (board) => board.id === boardId && board.status !== 'trashed',
  )
}

/**
 * Resolves whether `boardId` is accessible, switching the app's access
 * mode when the board only exists in the *other* mode's storage. Returns
 * `'not-found'` when the board exists in neither — the caller (router.tsx)
 * redirects home in that case, landing in whichever mode `accessModeAtom`
 * is left at (unchanged on a `'not-found'` result from either branch
 * below, so it's always "network if valid settings already got the app
 * into network mode, local otherwise").
 */
export async function resolveBoardAccess(
  boardId: string,
): Promise<BoardAccessResult> {
  const store = getDefaultStore()
  if (existsIn(store.get(boardsAtom), boardId)) return 'ok'

  if (store.get(accessModeAtom) === 'network') {
    // Local storage is always fully resident and synchronous — no
    // connection to test, just a direct peek.
    if (existsIn(loadBoard().board.boards, boardId)) {
      switchToLocalMode()
      store.set(accessModeAtom, 'local')
      return 'ok'
    }
    return 'not-found'
  }

  // Currently local — only worth trying network if there's something
  // configured to try.
  const config = store.get(networkConfigAtom)
  if (!config.baseUrl) return 'not-found'
  try {
    await testConnection(config)
    store.set(accessModeAtom, 'network')
    await initializeNetworkMode(config)
  } catch {
    // Connection failed (or initializeNetworkMode itself did, after
    // already flipping the mode flag — same edge case App.tsx's own boot
    // sequence has) — fall through to the same existence check either way,
    // there's nothing more to try here.
  }
  return existsIn(store.get(boardsAtom), boardId) ? 'ok' : 'not-found'
}
