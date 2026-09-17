// TanStack Router setup (multiboard support, ctx/notes/260917-multiboard-
// support-design.md §6): a single route pattern, `/board/$boardId` — the
// root board is the home screen and the root of the URL (`/` redirects to
// `/board/root`). The route's loader reads the live `boards` collection
// via jotai's default store (this app doesn't use a scoped Provider, so
// the default store is the one and only store, safely readable outside
// React) and falls back to root for an unknown or trashed board id — a
// stale/hand-edited URL shouldn't hard-crash the router. Root itself is
// never redirected, even if (through some broken invariant) it were
// somehow missing from `boards` — redirecting root to itself on a failed
// check would infinite-loop.

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { getDefaultStore } from 'jotai'
import { BoardPage } from './components/canvas/BoardPage'
import { RecoveryBanner } from './components/notifications/RecoveryBanner'
import { Toolbar } from './components/toolbar/Toolbar'
import { ROOT_BOARD_ID } from './schema/boardMeta'
import { boardsAtom } from './state/atoms/boards'

function RootLayout() {
  return (
    <div className="app">
      <RecoveryBanner />
      <Toolbar />
      <Outlet />
    </div>
  )
}

export const rootRoute = createRootRoute({ component: RootLayout })

const rootRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({
      to: '/board/$boardId',
      params: { boardId: ROOT_BOARD_ID },
    })
  },
})

function boardExists(boardId: string): boolean {
  return getDefaultStore()
    .get(boardsAtom)
    .some((board) => board.id === boardId && board.status !== 'trashed')
}

export const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/board/$boardId',
  beforeLoad: ({ params }) => {
    if (params.boardId === ROOT_BOARD_ID) return
    if (!boardExists(params.boardId)) {
      throw redirect({
        to: '/board/$boardId',
        params: { boardId: ROOT_BOARD_ID },
      })
    }
  },
  component: BoardPage,
})

const routeTree = rootRoute.addChildren([rootRedirectRoute, boardRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
