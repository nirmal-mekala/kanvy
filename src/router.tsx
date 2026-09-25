// TanStack Router setup (multiboard support, ctx/notes/260917-multiboard-
// support-design.md §6, revised 260918 — see ctx/notes/260918-url-scheme-
// and-board-title-visibility.md): the root board is the home screen and
// lives at `/`, the root of the URL; every other board lives at `/$boardId`
// (no `/board` prefix). The `/$boardId` route's `beforeLoad` reads the live
// `boards` collection via jotai's default store (this app doesn't use a
// scoped Provider, so the default store is the one and only store, safely
// readable outside React) and redirects to `/` for the root board id itself
// (it has its own route already) or for an unknown/trashed board id — a
// stale/hand-edited URL shouldn't hard-crash the router. `/` itself is
// never redirected for that "self" case, even if (through some broken
// invariant) root were somehow missing from `boards` — redirecting it to
// itself on a failed check would infinite-loop. It *is* redirected exactly
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
import { getDefaultStore } from 'jotai'
import { BoardPage } from './components/canvas/BoardPage'
import { NetworkErrorBanner } from './components/notifications/NetworkErrorBanner'
import { RecoveryBanner } from './components/notifications/RecoveryBanner'
import { ToastStack } from './components/notifications/ToastStack'
import { Toolbar } from './components/toolbar/Toolbar'
import { ROOT_BOARD_ID } from './schema/boardMeta'
import { boardsAtom } from './state/atoms/boards'
import { freshBoardIdAtom } from './state/history/boardHistoryAtom'
import { ensureBoardLoaded } from './state/networkBoardLoader'
import { registerBoardNavigator } from './state/networkReconcile'

function RootLayout() {
  // Rendered above the route Outlet for every route, so `boardId` isn't a
  // route param here directly — `strict: false` reads it from whichever
  // matched route has it, falling back to the root board on `/`.
  const { boardId = ROOT_BOARD_ID } = useParams({ strict: false })
  return (
    <div className="app">
      <RecoveryBanner />
      <NetworkErrorBanner />
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
  },
  component: () => <BoardPage boardId={ROOT_BOARD_ID} />,
})

function boardExists(boardId: string): boolean {
  return getDefaultStore()
    .get(boardsAtom)
    .some((board) => board.id === boardId && board.status !== 'trashed')
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
  beforeLoad: async ({ params }) => {
    if (params.boardId === ROOT_BOARD_ID || !boardExists(params.boardId)) {
      throw redirect({ to: '/' })
    }
    try {
      await ensureBoardLoaded(params.boardId)
    } catch {
      // Non-blocking (design doc §7) — `ensureBoardLoaded` already
      // surfaced this via `networkLoadErrorAtom`'s retry banner; the
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

export const router = createRouter({ routeTree })

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
