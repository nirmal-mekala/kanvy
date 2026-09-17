import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'
import { dispatchPaste } from './fixtures/clipboard'

// Multiboard support, Sub-phases 3-4 (ctx/notes/260917-multiboard-
// implementation-plan.md §5-6): TanStack Router adoption,
// `/board/$boardId` route, breadcrumb (Sub-phase 3), then the `board`
// card kind itself — create/rename/click-to-navigate, root content-gating
// (Sub-phase 4). The Sub-phase 3 tests below seed a schema v3 document
// with a second board directly into localStorage (no board-creation UI
// existed yet at that point); the Sub-phase 4 tests exercise the real
// create-a-board-from-the-UI flow end to end.

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

// The default fresh-install seed board (schema/seed.ts) already has a
// "Welcome to Kanvy" text card on root — these scenarios need a genuinely
// empty root to make single-card assertions meaningful.
const EMPTY_ROOT_DOCUMENT = {
  version: 3,
  nodes: [],
  edges: [],
  boards: [
    {
      id: 'root',
      title: 'Home',
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  images: {},
}

test.describe('board card kind (Sub-phase 4)', () => {
  test('double-click on root creates a board card, not a text card', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 400, y: 300 } })

    const card = page.locator('[data-testid="card"]')
    await expect(card).toHaveCount(1)
    await expect(card).toHaveClass(/card--board/)
  })

  test('root only ever creates board/container nodes — text/image/link creation paths are disabled there (design doc §3)', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')

    // Plain-text OS-clipboard paste: normally creates a text card.
    await dispatchPaste(page, { text: 'hello from clipboard' })
    await expect(page.locator('[data-testid="card"]')).toHaveCount(0)

    // ⌘/Ctrl+N: normally creates an empty text card.
    await page.keyboard.press('ControlOrMeta+n')
    await expect(page.locator('[data-testid="card"]')).toHaveCount(0)
  })

  test('the full board-node lifecycle: create, rename on-canvas, navigate in, rename via breadcrumb, navigate out', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')

    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 400, y: 300 } })
    const boardCard = page.locator('[data-testid="card"]')
    await expect(boardCard).toHaveClass(/card--board/)

    // Select via the border (card__bar) — the interior is the
    // click-to-navigate activation target, same as a link card.
    await boardCard.locator('.card__bar').click()
    const titleField = page.locator('.card__content[aria-label="Board title"]')
    await expect(titleField).toBeVisible()
    await titleField.fill('Project Alpha')

    // Interior click navigates in.
    await boardCard.locator('.card__board-body').click()
    await expect(page).not.toHaveURL(/\/board\/root$/)
    await expect(page.locator('.breadcrumb__title')).toHaveText('Project Alpha')

    // Rename via breadcrumb — same underlying field as the on-canvas one.
    await page.locator('.breadcrumb__title').click()
    await page
      .locator('.breadcrumb__title-input')
      .fill('Renamed via breadcrumb')
    await page.locator('.breadcrumb__title-input').blur()
    await expect(page.locator('.breadcrumb__title')).toHaveText(
      'Renamed via breadcrumb',
    )

    // Navigate back out via the home icon; the board-node's title field
    // reflects the breadcrumb rename, proving both write the same field.
    await page.locator('.breadcrumb__home').click()
    await expect(page).toHaveURL(/\/board\/root$/)
    await boardCard.locator('.card__bar').click()
    await expect(titleField).toHaveValue('Renamed via breadcrumb')
  })

  test('a board card is never convertible (no kind-conversion path applies to it)', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 400, y: 300 } })
    const boardCard = page.locator('[data-testid="card"]')
    await boardCard.locator('.card__bar').click()

    // Pasting a URL onto a selected (but not focused-caption) board card
    // must not convert it — board cards have no focusable caption
    // textarea to begin with (design doc §3: no kind-conversion applies).
    await dispatchPaste(page, { text: 'https://example.com' })
    await expect(boardCard).toHaveClass(/card--board/)
    await expect(page.locator('.card--link')).toHaveCount(0)
  })
})
