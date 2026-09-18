// TanStack Router setup (multiboard support, ctx/notes/260917-multiboard-
// support-design.md §6, revised 260918 — see ctx/notes/260918-url-scheme-
// and-board-title-visibility.md): the root board is the home screen and
// lives at `/`, the root of the URL; every other board lives at `/$boardId`
// (no `/board` prefix). The `/$boardId` route's `beforeLoad` reads the live
// `boards` collection via jotai's default store (this app doesn't use a
// scoped Provider, so the default store is the one and only store, safely
// readable outside React) and redirects to `/` for the root board id itself
// (it has its own route already) or for an unknown/trashed board id — a
// stale/hand-edited URL shouldn't hard-crash the router. `/` is never
// redirected, even if (through some broken invariant) root were somehow
// missing from `boards` — redirecting it to itself on a failed check would
// infinite-loop.

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

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
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
  beforeLoad: ({ params }) => {
    if (params.boardId === ROOT_BOARD_ID || !boardExists(params.boardId)) {
      throw redirect({ to: '/' })
    }
  },
  component: BoardRouteComponent,
})

const routeTree = rootRoute.addChildren([homeRoute, boardRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
