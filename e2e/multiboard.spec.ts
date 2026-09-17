import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'

// Multiboard support, Sub-phase 3 (ctx/notes/260917-multiboard-
// implementation-plan.md §5): TanStack Router adoption, `/board/$boardId`
// route, breadcrumb. No board-creation UI exists yet (Sub-phase 4), so
// these seed a schema v3 document with a second board directly into
// localStorage to exercise navigation/scoping/rename end-to-end.

const NOW = '2026-01-01T00:00:00.000Z'

const ROOT_CARD = {
  id: 'root-card',
  boardId: 'root',
  type: 'card',
  kind: 'text',
  size: 'regular',
  x: 100,
  y: 100,
  w: 224,
  h: 90,
  color: 'gray',
  content: 'Root content',
  createdAt: NOW,
  updatedAt: NOW,
}

const CHILD_CARD = {
  ...ROOT_CARD,
  id: 'child-card',
  boardId: 'child-1',
  content: 'Child content',
}

const TWO_BOARD_DOCUMENT = {
  version: 3,
  nodes: [ROOT_CARD, CHILD_CARD],
  edges: [],
  boards: [
    {
      id: 'root',
      title: 'Home',
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'child-1',
      title: 'Untitled board',
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  images: {},
}

test('the root path redirects to /board/root', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/board\/root$/)
})

test('navigating to an unknown board id redirects to /board/root', async ({
  page,
}) => {
  await page.goto('/board/does-not-exist')
  await expect(page).toHaveURL(/\/board\/root$/)
  await expect(page.locator('[data-testid="canvas-root"]')).toBeVisible()
})

test('the breadcrumb shows only the home icon on root, with no editable title', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.breadcrumb__home')).toBeVisible()
  await expect(page.locator('.breadcrumb__title')).toHaveCount(0)
})

test("navigating to a second board shows only that board's own content, scoped independently of root", async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/board/child-1')

  await expect(page).toHaveURL(/\/board\/child-1$/)
  await expect(page.getByText('Child content')).toBeVisible()
  await expect(page.getByText('Root content')).toHaveCount(0)
  await expect(page.locator('.breadcrumb__title')).toHaveText('Untitled board')

  // Home icon still navigates back to root, showing root's own content
  // instead.
  await page.locator('.breadcrumb__home').click()
  await expect(page).toHaveURL(/\/board\/root$/)
  await expect(page.getByText('Root content')).toBeVisible()
  await expect(page.getByText('Child content')).toHaveCount(0)
})

test('breadcrumb rename commits on blur and writes the same title the on-canvas rename will read (design doc §6)', async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/board/child-1')

  await page.locator('.breadcrumb__title').click()
  const input = page.locator('.breadcrumb__title-input')
  await expect(input).toBeFocused()
  await input.fill('Project Alpha')
  await input.blur()

  await expect(page.locator('.breadcrumb__title')).toHaveText('Project Alpha')

  // Persisted, not just in-memory. Autosave is debounced
  // (state/persistence/storage.ts, 500ms default) — poll for the write
  // landing rather than guessing a fixed wait. Deliberately not verified
  // via reload-and-re-read: `seedBoard`'s `page.addInitScript` re-runs on
  // every navigation (including `reload()`), which would re-seed the
  // original fixture and overwrite this very persistence, testing the
  // wrong thing.
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('kanvy.board')))
    .toContain('Project Alpha')
})

test('breadcrumb rename cancels on Escape without committing', async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/board/child-1')

  await page.locator('.breadcrumb__title').click()
  await page.locator('.breadcrumb__title-input').fill('Should not stick')
  await page.keyboard.press('Escape')

  await expect(page.locator('.breadcrumb__title')).toHaveText('Untitled board')
})
