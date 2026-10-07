// TanStack Router setup (multiboard support, ctx/notes/260917-multiboard-
// support-design.md §6, revised 260918 — see ctx/notes/260918-url-scheme-
// and-board-title-visibility.md): the root board is the home screen and
// lives at `/`, the root of the URL; every other board lives at `/$boardId`
// (no `/board` prefix). The `/$boardId` route's `beforeLoad` resolves the
// board id via `resolveBoardAccess` (state/boardAccessResolver.ts, checks
// both access modes, switching into whichever one actually has the board)
// and redirects to `/` for the root board's own id (it has its own route
// already) or for a board id unknown/trashed in both modes — a stale/
// hand-edited URL shouldn't hard-crash the router. `/` itself is
// never redirected for that "self" case — redirecting it to itself on a
// failed check would infinite-loop.
//
// Schema v6 (ctx/notes/261006-root-board-isroot.md): the root board has no
// fixed id, so `/` doesn't name one — it means "whichever board is
// `isRoot` in the live document" (`rootBoardIdAtom`), which differs
// between Local and Network mode. It *is* redirected exactly
// once, away from itself, on a brand-new user's first visit: see
// `freshBoardIdAtom`'s doc comment (state/history/boardHistoryAtom.ts) —
// a first-time visit lands on a new non-home board instead of home itself.

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router'
import { getDefaultStore, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { BoardPage } from './components/canvas/BoardPage'
import { NetworkErrorNotice } from './components/notifications/NetworkErrorNotice'
import { RecoveryNotice } from './components/notifications/RecoveryNotice'
import { ToastStack } from './components/notifications/ToastStack'
import { Toolbar } from './components/toolbar/Toolbar'
import { boardsAtom } from './state/atoms/boards'
import { currentBoardIdAtom, rootBoardIdAtom } from './state/atoms/currentBoard'
import { resolveBoardAccess } from './state/boardAccessResolver'
import { freshBoardIdAtom } from './state/history/boardHistoryAtom'
import { ensureBoardLoaded } from './state/networkBoardLoader'
import { registerBoardNavigator } from './state/networkReconcile'

/**
 * Reactive counterpart to `boardRoute.beforeLoad`'s `resolveBoardAccess`
 * guard: that guard only runs at navigation time, so a board that
 * disappears out from under an already-rendered route — e.g.
 * `initializeNetworkMode`'s
 * boot-time auto-reconnect (App.tsx) or `switchToLocalMode` wholesale-
 * replacing `boardsAtom` after the route already resolved, or an undo that
 * removes the viewed board's own `create` op — leaves the URL pointed at a
 * now-nonexistent board with nothing to catch it. This re-checks on every
 * `boardsAtom` change and sends the user home the same way, covering both
 * that case and a stale/invalid bookmarked link that only turns out to be
 * unavailable after boot-time state (e.g. a network reconnect) settles.
 */
function useBoardExistenceGuard(boardId: string) {
  const boards = useAtomValue(boardsAtom)
  const rootId = useAtomValue(rootBoardIdAtom)
  useEffect(() => {
    if (boardId === rootId) return
    const exists = boards.some(
      (board) => board.id === boardId && board.status !== 'trashed',
    )
    if (!exists) {
      void router.navigate({ to: '/', replace: true })
    }
  }, [boardId, boards, rootId])
}

function RootLayout() {
  // Rendered above the route Outlet for every route, so `boardId` isn't a
  // route param here directly — `strict: false` reads it from whichever
  // matched route has it, falling back to the root board on `/`.
  const { boardId: routeBoardId } = useParams({ strict: false })
  const rootId = useAtomValue(rootBoardIdAtom)
  const boardId = routeBoardId ?? rootId
  useBoardExistenceGuard(boardId)
  return (
    <div className="app">
      <RecoveryNotice />
      <NetworkErrorNotice />
      <Toolbar boardId={boardId} />
      <ToastStack />
      <Outlet />
    </div>
  )
}

export const rootRoute = createRootRoute({ component: RootLayout })

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const store = getDefaultStore()
    const freshBoardId = store.get(freshBoardIdAtom)
    if (freshBoardId !== undefined) {
      // Consume once, so a later deliberate visit to `/` isn't redirected.
      store.set(freshBoardIdAtom, undefined)
      throw redirect({ to: '/$boardId', params: { boardId: freshBoardId } })
    }
    // Set here, not in a `BoardPage` effect: home and board routes render
    // different component types at the same `Outlet` slot, so navigating
    // between them unmounts/remounts `BoardPage` rather than updating its
    // props — an effect-based sync would leave `currentBoardIdAtom` (and
    // everything Canvas derives from it) stale for a whole extra render.
    // `beforeLoad` runs before the new route's component ever mounts, so
    // setting it here keeps it correct from that component's first render.
    // `undefined` = "the home board", resolved against the live document's
    // root on every read rather than pinned to today's root id here.
    store.set(currentBoardIdAtom, undefined)
  },
  component: HomeRouteComponent,
})

function HomeRouteComponent() {
  return <BoardPage boardId={useAtomValue(rootBoardIdAtom)} />
}

function BoardRouteComponent() {
  const { boardId } = boardRoute.useParams()
  return <BoardPage boardId={boardId} />
}

export const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$boardId',
  // Board navigation (network mode design doc §6c): blocks on fetching a
  // not-yet-loaded board's own nodes/edges/images before rendering it —
  // `ensureBoardLoaded` is a no-op in local mode (everything's already
  // resident) and resolves immediately if the background eager-load
  // (§6b) already reached this board, so this await is invisible in both
  // of those cases and only actually blocks the one case it needs to.
  //
  // `resolveBoardAccess` (state/boardAccessResolver.ts) checks the
  // *other* access mode too before giving up — a board id only found
  // there switches the whole app into that mode rather than redirecting
  // home, so a bookmarked/linked board id from either mode's storage
  // works regardless of which mode the app happens to currently be in.
  beforeLoad: async ({ params }) => {
    if ((await resolveBoardAccess(params.boardId)) === 'not-found') {
      throw redirect({ to: '/' })
    }
    // Checked *after* access resolution, not before: the id may be the
    // other mode's root, which only becomes "the root" once
    // `resolveBoardAccess` has switched into that mode.
    if (params.boardId === getDefaultStore().get(rootBoardIdAtom)) {
      throw redirect({ to: '/' })
    }
    // See homeRoute's `beforeLoad` comment: set pre-mount, not via a
    // `BoardPage` effect, so it's never stale across the unmount/remount
    // this route's component boundary causes.
    getDefaultStore().set(currentBoardIdAtom, params.boardId)
    try {
      await ensureBoardLoaded(params.boardId)
    } catch {
      // Non-blocking (design doc §7) — `ensureBoardLoaded` already
      // surfaced this via `networkLoadErrorAtom`'s error toast; the
      // route still renders (with whatever content is resident so far)
      // rather than hard-failing the navigation.
    }
  },
  pendingComponent: () => (
    <div className="board__loading" role="status">
      Loading board…
    </div>
  ),
  component: BoardRouteComponent,
})

const routeTree = rootRoute.addChildren([homeRoute, boardRoute])

// `basepath` tracks Vite's own `base` (default `/`, overridden via the
// `--base` CLI flag) instead of a hardcoded value — the GH Pages deploy
// workflow builds with `--base=/kanvy/` (project pages are served from a
// subpath), and `import.meta.env.BASE_URL` is Vite's single source of
// truth for that, so this needs no separate config to stay in sync.
export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
})

// state/networkReconcile.ts's redirect-the-address-bar step (when a
// network create's real board id gets reconciled into a board the user
// is still viewing) is registered here rather than that module importing
// `router` directly — see its own doc comment for the circular-import
// this avoids.
registerBoardNavigator((boardId) => {
  void router.navigate({ to: '/$boardId', params: { boardId }, replace: true })
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
