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
