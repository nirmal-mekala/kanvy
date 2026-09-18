import type { Page } from '@playwright/test'

/**
 * Seeds `localStorage` with a board document before the app's first
 * script runs, so scenario specs (phase 7) don't each hand-roll setup.
 * `board` is intentionally loosely typed here — the real `Board` type is
 * `schema/`'s (phase 7 Stage 1), not this harness's, to own.
 */
export async function seedBoard(
  page: Page,
  board: unknown,
  storageKey = 'kanvy-board',
): Promise<void> {
  await page.addInitScript(
    ({ board, storageKey }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(board))
    },
    { board, storageKey },
  )
}

/**
 * The board id every `childBoardDocument` scenario navigates to —
 * multiboard support (ctx/notes/260917-multiboard-support-design.md §3):
 * root only ever creates `board`/`container` nodes, so any scenario that
 * exercises double-click/drop/paste/⌘N text-image-link *creation* needs a
 * non-root board to run on, not `/root`.
 */
export const CHILD_BOARD_ID = 'e2e-child'

/**
 * Wraps `nodes`/`edges` into a schema v3 document with a non-root child
 * board, stamping `boardId: CHILD_BOARD_ID` onto every one of them.
 * Pair with `page.goto('/' + CHILD_BOARD_ID)`, not `page.goto('/')`
 * — the latter lands on root, where new text/image/link cards can't be
 * created at all.
 */
export function childBoardDocument(
  nodes: readonly Record<string, unknown>[],
  edges: readonly Record<string, unknown>[] = [],
): unknown {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    version: 3,
    nodes: nodes.map((node) => ({ ...node, boardId: CHILD_BOARD_ID })),
    edges: edges.map((edge) => ({ ...edge, boardId: CHILD_BOARD_ID })),
    boards: [
      {
        id: 'root',
        title: 'Home',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: CHILD_BOARD_ID,
        title: 'Child board',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    images: {},
  }
}
