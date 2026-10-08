import { expect, test } from '@playwright/test'
import { ROOT_BOARD_ID, seedBoard } from './fixtures/board'
import { dispatchPaste } from './fixtures/clipboard'

// Multiboard support, Sub-phases 3-4 (ctx/notes/260917-multiboard-
// implementation-plan.md §5-6): TanStack Router adoption,
// `/`(home) + `/$boardId` routes, breadcrumb (Sub-phase 3), then the
// `board` card kind itself — create/rename/click-to-navigate, root
// content-gating (Sub-phase 4). The Sub-phase 3 tests below seed a schema
// v3 document with a second board directly into localStorage (no
// board-creation UI existed yet at that point); the Sub-phase 4 tests
// exercise the real create-a-board-from-the-UI flow end to end.

const NOW = '2026-01-01T00:00:00.000Z'

const ROOT_CARD = {
  id: 'root-card',
  boardId: ROOT_BOARD_ID,
  nodeType: 'card',
  cardType: 'text',
  size: 'regular',
  x: 100,
  y: 100,
  w: 224,
  h: 90,
  color: 'gray',
  task: 'none',
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
  version: 7,
  nodes: [ROOT_CARD, CHILD_CARD],
  edges: [],
  boards: [
    {
      id: ROOT_BOARD_ID,
      title: 'Home',
      status: 'active',
      isRoot: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'child-1',
      title: 'Untitled board',
      status: 'active',
      isRoot: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  images: {},
}

// Every test below that navigates to `/` (or to a path that redirects
// there) seeds an already-non-fresh local board first — on a genuinely
// fresh profile, the `/` route takes the brand-new-user onboarding
// redirect (`freshBoardIdAtom`, state/history/boardHistoryAtom.ts; the
// `/` route's `beforeLoad` in router.tsx) to a freshly-minted non-home
// board instead of staying on root. That's intentional product behavior,
// not something these root-path/breadcrumb invariants are testing, so it
// has to be sidestepped the same way every other e2e spec that visits `/`
// already does (see e.g. settingsNetworkMode.spec.ts's own seed-first
// comment).

test('a brand-new profile (nothing in localStorage) is redirected from / to a freshly-minted welcome board, not left on root', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/$/)
  await expect(page.locator('[data-testid="canvas-root"]')).toBeVisible()
  await expect(page.getByText('Welcome to Kanvy')).toBeVisible()

  // NOT re-asserted here: `freshBoardIdAtom`'s doc comment claims this is
  // "consumed once, so a later deliberate visit to `/` isn't redirected" —
  // but that's only true of an in-session client-side re-visit. A second
  // `page.goto('/')` (a real navigation, reloading the app fresh) redirects
  // *again*, to a *different* new welcome board each time — the seed board
  // is never actually persisted to localStorage until the user edits it,
  // so every full reload of an untouched fresh profile re-triggers
  // onboarding from scratch. See the finding reported alongside this test.
})

test('the root path is the home board', async ({ page }) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('[data-testid="canvas-root"]')).toBeVisible()
})

test('navigating to an unknown board id redirects to /', async ({ page }) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/does-not-exist')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('[data-testid="canvas-root"]')).toBeVisible()
})

test("navigating to the root board's own id as a path segment redirects to /", async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto(`/${ROOT_BOARD_ID}`)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Root content')).toBeVisible()
})

// Schema v6 (ctx/notes/261006-root-board-isroot.md): a document persisted
// before `isRoot` existed designates its home board by the reserved id
// `'root'`. It must still load — migrated on read, not treated as corrupt.
test.describe('a pre-v6 localStorage document (reserved "root" id, no isRoot)', () => {
  const LEGACY_V5_DOCUMENT = {
    ...TWO_BOARD_DOCUMENT,
    version: 5,
    nodes: [
      { ...ROOT_CARD, boardId: 'root', status: 'active', index: 0 },
      { ...CHILD_CARD, status: 'active', index: 0 },
    ],
    boards: TWO_BOARD_DOCUMENT.boards.map(({ isRoot, ...meta }) =>
      isRoot ? { ...meta, id: 'root' } : meta,
    ),
    images: [],
  }

  test('loads without a recovery notice, with its home content still on /', async ({
    page,
  }) => {
    await seedBoard(page, LEGACY_V5_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Root content')).toBeVisible()
    await expect(page.getByText("couldn't be read")).toHaveCount(0)
  })

  test('its child boards keep their ids and stay reachable', async ({
    page,
  }) => {
    await seedBoard(page, LEGACY_V5_DOCUMENT, 'kanvy.board')
    await page.goto('/child-1')
    await expect(page).toHaveURL(/\/child-1$/)
    await expect(page.getByText('Child content')).toBeVisible()
  })

  test('/root is no longer special — it is just an unknown board id, redirected home', async ({
    page,
  }) => {
    await seedBoard(page, LEGACY_V5_DOCUMENT, 'kanvy.board')
    await page.goto('/root')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Root content')).toBeVisible()
  })
})

test('the breadcrumb shows only the home icon on root, with no editable title', async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/')
  await expect(page.locator('.breadcrumb__home')).toBeVisible()
  await expect(page.locator('.breadcrumb__title')).toHaveCount(0)
})

test("navigating to a second board shows only that board's own content, scoped independently of root", async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/child-1')

  await expect(page).toHaveURL(/\/child-1$/)
  await expect(page.getByText('Child content')).toBeVisible()
  await expect(page.getByText('Root content')).toHaveCount(0)
  await expect(page.locator('.breadcrumb__title')).toHaveText('Untitled board')

  // Home icon still navigates back to root, showing root's own content
  // instead.
  await page.locator('.breadcrumb__home').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Root content')).toBeVisible()
  await expect(page.getByText('Child content')).toHaveCount(0)
})

test('breadcrumb title is a hover-to-edit control: pencil on hover, checkmark while editing, commits via checkmark click (design doc §6, shared with the on-canvas board name)', async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/child-1')

  const title = page.locator('.breadcrumb__title')
  const editBtn = title.locator('.board-name__edit-btn')
  await expect(title.locator('.board-name__text')).toHaveText('Untitled board')

  await title.hover()
  await editBtn.click()
  const input = title.locator('.board-name__input')
  await expect(input).toBeFocused()
  await expect(title.locator('.board-name__edit-btn--confirm')).toBeVisible()
  await input.fill('Project Alpha')
  await title.locator('.board-name__edit-btn--confirm').click()

  await expect(title.locator('.board-name__text')).toHaveText('Project Alpha')
  await expect(title.locator('.board-name__input')).toHaveCount(0)

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

test('breadcrumb rename commits via Enter too, not just the checkmark', async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/child-1')

  const title = page.locator('.breadcrumb__title')
  await title.hover()
  await title.locator('.board-name__edit-btn').click()
  await title.locator('.board-name__input').fill('Committed via Enter')
  await page.keyboard.press('Enter')
  await expect(title.locator('.board-name__text')).toHaveText(
    'Committed via Enter',
  )
})

test('breadcrumb rename discards the draft on Escape', async ({ page }) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/child-1')

  const title = page.locator('.breadcrumb__title')

  await title.hover()
  await title.locator('.board-name__edit-btn').click()
  await title.locator('.board-name__input').fill('Should not stick (Escape)')
  await page.keyboard.press('Escape')
  await expect(title.locator('.board-name__text')).toHaveText('Untitled board')
})

// Commit-on-blur (ctx/notes/260918-board-node-redesign.md §"Editing":
// "blur (click away), Enter, or clicking the checkmark all commit").
test('breadcrumb rename also commits on blur, not just Enter/checkmark', async ({
  page,
}) => {
  await seedBoard(page, TWO_BOARD_DOCUMENT, 'kanvy.board')
  await page.goto('/child-1')

  const title = page.locator('.breadcrumb__title')

  await title.hover()
  await title.locator('.board-name__edit-btn').click()
  await title.locator('.board-name__input').fill('Committed via blur')
  await page.locator('.breadcrumb__home').focus()
  await expect(title.locator('.board-name__text')).toHaveText(
    'Committed via blur',
  )
})

// The default fresh-install seed board (schema/seed.ts) already has a
// "Welcome to Kanvy" text card on root — these scenarios need a genuinely
// empty root to make single-card assertions meaningful.
const EMPTY_ROOT_DOCUMENT = {
  version: 7,
  nodes: [],
  edges: [],
  boards: [
    {
      id: ROOT_BOARD_ID,
      title: 'Home',
      status: 'active',
      isRoot: true,
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

  test('a board card shows a "this is a board" icon centered in its drag bar, and its name on the canvas even when not selected', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 400, y: 300 } })

    const boardCard = page.locator('[data-testid="card"]')
    await expect(boardCard).not.toHaveClass(/card--selected/)
    await expect(
      boardCard.locator('.card__bar .card__board-icon'),
    ).toBeVisible()
    await expect(boardCard.locator('.board-name__text')).toHaveText(
      'Untitled board',
    )
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

    // The name row is always visible (not select-gated). Editing goes
    // through the shared hover-to-edit control: hover reveals a pencil,
    // clicking it swaps in the input plus a checkmark to confirm.
    const nameText = boardCard.locator('.board-name__text')
    await expect(nameText).toBeVisible()
    await boardCard.locator('.board-name').hover()
    await boardCard.locator('.board-name__edit-btn').click()
    await boardCard.locator('.board-name__input').fill('Project Alpha')
    await boardCard.locator('.board-name__edit-btn--confirm').click()
    await expect(nameText).toHaveText('Project Alpha')

    // Clicking the icon+text activates (navigates in) — same click-to-
    // navigate semantics the link card uses for its interior.
    await boardCard.locator('.board-name__activate').click()
    await expect(page).not.toHaveURL(/\/$/)
    await expect(
      page.locator('.breadcrumb__title .board-name__text'),
    ).toHaveText('Project Alpha')

    // Rename via breadcrumb — same underlying field/control as the
    // on-canvas one.
    const breadcrumbTitle = page.locator('.breadcrumb__title')
    await breadcrumbTitle.hover()
    await breadcrumbTitle.locator('.board-name__edit-btn').click()
    await breadcrumbTitle
      .locator('.board-name__input')
      .fill('Renamed via breadcrumb')
    await breadcrumbTitle.locator('.board-name__edit-btn--confirm').click()
    await expect(breadcrumbTitle.locator('.board-name__text')).toHaveText(
      'Renamed via breadcrumb',
    )

    // Navigate back out via the home icon; the board-node's name reflects
    // the breadcrumb rename, proving both write the same field.
    await page.locator('.breadcrumb__home').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(nameText).toHaveText('Renamed via breadcrumb')
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

test.describe('confirm modal + board delete/duplicate/paste (Sub-phase 5)', () => {
  test('deleting a board node shows a confirm modal; cancel leaves everything unchanged', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 400, y: 300 } })
    await page.locator('[data-testid="card"]').locator('.card__bar').click()

    await page.keyboard.press('Backspace')
    await expect(page.locator('.confirm-modal')).toBeVisible()
    await expect(page.locator('.confirm-modal__title')).toHaveText(
      'Delete 1 board (0 nodes total)?',
    )

    await page.locator('.confirm-modal__btn--cancel').click()
    await expect(page.locator('.confirm-modal')).toHaveCount(0)
    await expect(page.locator('[data-testid="card"]')).toHaveCount(1)
  })

  test('confirming delete tombstones the board node; undo restores it', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 400, y: 300 } })
    await page.locator('[data-testid="card"]').locator('.card__bar').click()

    // Past the 400ms undo-coalescing window, so the delete records its
    // own undo step rather than merging with the board's creation.
    await page.waitForTimeout(500)
    await page.keyboard.press('Backspace')
    await page.locator('.confirm-modal__btn--confirm').click()
    await expect(page.locator('[data-testid="card"]')).toHaveCount(0)

    await page.keyboard.press('Control+z')
    await expect(page.locator('[data-testid="card"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="card"]')).toHaveClass(
      /card--board/,
    )
  })

  test('duplicating a board node with content shows the confirm modal with the real node count, and deep-copies on confirm', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')

    // Create a board, navigate in, add two cards, navigate back out.
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 400, y: 300 } })
    await page
      .locator('[data-testid="card"]')
      .locator('.board-name__activate')
      .click()
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 200, y: 200 } })
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 500, y: 200 } })
    await expect(page.locator('[data-testid="card"]')).toHaveCount(2)
    await page.locator('.breadcrumb__home').click()
    await expect(page.locator('[data-testid="card"]')).toHaveCount(1)

    await page.locator('[data-testid="card"]').locator('.card__bar').click()
    await page.keyboard.press('Control+d')
    await expect(page.locator('.confirm-modal__title')).toHaveText(
      'Duplicate 1 board (2 nodes total)?',
    )
    await page.locator('.confirm-modal__btn--confirm').click()

    // Two board nodes on root now, each pointing at its own board (a
    // distinct boardRef, and each with its own 2-node content) — checked
    // via the persisted data rather than clicking to navigate into each:
    // the duplicate's small placement offset leaves the two cards
    // overlapping, so one's `.card__board-body` sits under the other's
    // pointer-event-intercepting DOM subtree.
    await expect(page.locator('[data-testid="card"]')).toHaveCount(2)
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() =>
          window.localStorage.getItem('kanvy.board'),
        )
        const parsed = JSON.parse(raw ?? '{}') as {
          nodes: { boardId: string; cardType?: string; boardRef?: string }[]
        }
        const boardRefs = parsed.nodes
          .filter((n) => n.cardType === 'board')
          .map((n) => n.boardRef)
        const contentCounts = boardRefs.map(
          (ref) => parsed.nodes.filter((n) => n.boardId === ref).length,
        )
        return { distinctBoards: new Set(boardRefs).size, contentCounts }
      })
      .toEqual({ distinctBoards: 2, contentCounts: [2, 2] })
  })

  test('pasting a copied board node deep-copies it too, never sharing the original boardRef', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_ROOT_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await page
      .locator('[data-testid="canvas-root"]')
      .dblclick({ position: { x: 400, y: 300 } })
    await page.locator('[data-testid="card"]').locator('.card__bar').click()
    await page.keyboard.press('Control+c')

    // The in-app clipboard is a jotai atom, not the real OS clipboard —
    // triggering it via a synthetic `paste` event (like every other
    // paste-driven e2e scenario, e.g. clipboard.spec.ts's `dispatchPaste`
    // calls) rather than a real Control+V keypress, which needs actual OS
    // clipboard content/permissions this app never writes to for a
    // caption-less board card.
    await dispatchPaste(page, {})
    await expect(page.locator('.confirm-modal__title')).toHaveText(
      'Paste 1 board (0 nodes total)?',
    )
    await page.locator('.confirm-modal__btn--confirm').click()

    await expect(page.locator('[data-testid="card"]')).toHaveCount(2)
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() =>
          window.localStorage.getItem('kanvy.board'),
        )
        const parsed = JSON.parse(raw ?? '{}') as {
          nodes: { cardType?: string; boardRef?: string }[]
        }
        const boardRefs = parsed.nodes
          .filter((n) => n.cardType === 'board')
          .map((n) => n.boardRef)
        return new Set(boardRefs).size
      })
      .toBe(2)
  })
})
