import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'

// Stage 4 (canvas & node rendering) — spec §4.1. Written against
// components/canvas/Canvas.tsx's actual DOM: `[data-testid="canvas-root"]`
// is the pannable/zoomable `.board` element; `.board__layer`'s inline
// `transform` carries the current pan/zoom as `translate(x, y) scale(z)`.
//
// Run and passing (all 6) via the playwright-remote-browser skill (host-Mac
// Playwright server, container dev server published on a forwarded port —
// see ctx/notes/260915-phase6-e2e-test-scenario-checklist.md for the
// updated checklist state). The zoom-button/reset-readout tests caught a
// real regression: the `.board` root's own pointerdown handler was
// hijacking pointer capture before these buttons' click events could fire
// — fixed in src/components/canvas/Canvas.tsx (`.board__zoom` now stops
// propagation).

const NODE_A = {
  id: 'node-a',
  type: 'card',
  kind: 'text',
  size: 'regular',
  x: 100,
  y: 100,
  w: 224,
  h: 90,
  color: 'gray',
  content: 'A',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const NODE_B = {
  ...NODE_A,
  id: 'node-b',
  x: 1000,
  y: 800,
  content: 'B',
}

const TWO_NODE_BOARD = {
  version: 1,
  nodes: [NODE_A, NODE_B],
  edges: [],
  images: {},
}

function parseTransform(transform: string): {
  x: number
  y: number
  zoom: number
} {
  const match =
    /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(
      transform,
    )
  if (!match) throw new Error(`unparsable transform: ${transform}`)
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) }
}

async function getView(page: import('@playwright/test').Page) {
  const transform = await page
    .locator('.board__layer')
    .evaluate((el) => (el as HTMLElement).style.transform)
  return parseTransform(transform)
}

test.beforeEach(async ({ page }) => {
  await seedBoard(page, TWO_NODE_BOARD, 'kanvy.board')
})

test('pan via right-click drag moves the viewport', async ({ page }) => {
  await page.goto('/')
  const board = page.locator('[data-testid="canvas-root"]')
  const box = await board.boundingBox()
  if (!box) throw new Error('board not rendered')
  const before = await getView(page)

  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(startX + 80, startY + 40, { steps: 5 })
  await page.mouse.up({ button: 'right' })

  const after = await getView(page)
  // toBeCloseTo, not toBe: `before` is now a zoom-to-fit position (this
  // board auto-fits on entry) rather than the old fixed {0,0,1} default,
  // so it's not necessarily an integer and exact float equality isn't
  // reliable here.
  expect(after.x).toBeCloseTo(before.x + 80, 2)
  expect(after.y).toBeCloseTo(before.y + 40, 2)
})

test('pan via mouse wheel (non-zoom axis) moves the viewport', async ({
  page,
}) => {
  await page.goto('/')
  const board = page.locator('[data-testid="canvas-root"]')
  await expect(board).toBeVisible()
  const before = await getView(page)

  await board.hover()
  await page.mouse.wheel(50, 30)

  const after = await getView(page)
  expect(after.x).not.toBe(before.x)
  expect(after.y).not.toBe(before.y)
  expect(after.zoom).toBe(before.zoom)
})

test('zoom via ctrl+scroll keeps the point under the cursor fixed', async ({
  page,
}) => {
  await page.goto('/')
  const board = page.locator('[data-testid="canvas-root"]')
  const box = await board.boundingBox()
  if (!box) throw new Error('board not rendered')

  const cursorX = box.x + box.width / 2
  const cursorY = box.y + box.height / 2
  await page.mouse.move(cursorX, cursorY)

  const before = await getView(page)
  const worldXBefore = (cursorX - box.x - before.x) / before.zoom
  const worldYBefore = (cursorY - box.y - before.y) / before.zoom

  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -200) // negative deltaY zooms in (spec §4.1)
  await page.keyboard.up('Control')

  const after = await getView(page)
  expect(after.zoom).toBeGreaterThan(before.zoom)
  const worldXAfter = (cursorX - box.x - after.x) / after.zoom
  const worldYAfter = (cursorY - box.y - after.y) / after.zoom
  expect(worldXAfter).toBeCloseTo(worldXBefore, 0)
  expect(worldYAfter).toBeCloseTo(worldYBefore, 0)
})

test('zoom-in/out buttons zoom around the viewport center', async ({
  page,
}) => {
  await page.goto('/')
  const before = await getView(page)

  await page.getByTitle('Zoom in').click()
  const afterIn = await getView(page)
  expect(afterIn.zoom).toBeGreaterThan(before.zoom)

  await page.getByTitle('Zoom out').click()
  await page.getByTitle('Zoom out').click()
  const afterOut = await getView(page)
  expect(afterOut.zoom).toBeLessThan(afterIn.zoom)
})

test('clicking the zoom-percentage readout resets zoom to 100%', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTitle('Zoom in').click()
  await page.getByTitle('Zoom in').click()
  expect((await getView(page)).zoom).not.toBe(1)

  await page.getByTitle('Reset zoom').click()
  expect((await getView(page)).zoom).toBe(1)
})

test('zoom to fit (Ctrl+Shift+Enter) never zooms in past 100% and centers the content', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTitle('Zoom in').click()
  await page.getByTitle('Zoom in').click()
  await page.getByTitle('Zoom in').click()

  await page.keyboard.press('Control+Shift+Enter')

  const view = await getView(page)
  expect(view.zoom).toBeLessThanOrEqual(1)

  // Both seeded nodes' combined bounding box should now be inside the
  // viewport (spec §4.1's "fully visible, fixed world-space padding").
  const board = page.locator('[data-testid="canvas-root"]')
  const boardBox = await board.boundingBox()
  const cardBoxes = await page.locator('.card').all()
  expect(cardBoxes.length).toBe(2)
  for (const card of cardBoxes) {
    const box = await card.boundingBox()
    if (!box || !boardBox) throw new Error('missing bounding box')
    expect(box.x).toBeGreaterThanOrEqual(boardBox.x - 1)
    expect(box.y).toBeGreaterThanOrEqual(boardBox.y - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(
      boardBox.x + boardBox.width + 1,
    )
    expect(box.y + box.height).toBeLessThanOrEqual(
      boardBox.y + boardBox.height + 1,
    )
  }
})

async function expectFullyVisible(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
) {
  const boardBox = await page
    .locator('[data-testid="canvas-root"]')
    .boundingBox()
  const box = await locator.boundingBox()
  if (!box || !boardBox) throw new Error('missing bounding box')
  expect(box.x).toBeGreaterThanOrEqual(boardBox.x - 1)
  expect(box.y).toBeGreaterThanOrEqual(boardBox.y - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(boardBox.x + boardBox.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(
    boardBox.y + boardBox.height + 1,
  )
}

test('entering a board (client-side navigation, no reload) snaps to zoom-to-fit for that board, both ways', async ({
  page,
}) => {
  const NOW = '2026-01-01T00:00:00.000Z'
  // Root's only content is a board card referencing `child-1`; child-1's
  // only content is a card placed far from the origin — if the previous
  // board's pan/zoom were carried over instead of refitting on entry, it
  // would not be anywhere near the viewport.
  const BOARD_CARD = {
    id: 'board-card',
    boardId: 'root',
    type: 'card',
    kind: 'board',
    boardRef: 'child-1',
    x: 400,
    y: 300,
    w: 224,
    h: 90,
    color: 'gray',
    content: '',
    createdAt: NOW,
    updatedAt: NOW,
  }
  const CHILD_CARD = {
    ...NODE_A,
    id: 'far-child-card',
    boardId: 'child-1',
    x: 3000,
    y: 2000,
  }
  const doc = {
    version: 3,
    nodes: [BOARD_CARD, CHILD_CARD],
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
        title: 'Child board',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    images: {},
  }
  await seedBoard(page, doc, 'kanvy.board')
  await page.goto('/')

  const boardCard = page.locator('[data-testid="card"]')
  await expect(boardCard).toHaveClass(/card--board/)
  await expectFullyVisible(page, boardCard)

  // Pan/zoom away from root's fit position (a small nudge, so the board
  // card stays on-screen and clickable) before navigating in — a
  // carried-over camera would otherwise happen to already still show it.
  await page.getByTitle('Zoom in').click()
  await page.mouse.wheel(60, 40)
  const panned = await getView(page)

  await boardCard.locator('.board-name__activate').click()
  await expect(page).toHaveURL(/\/child-1$/)
  // The child board's content sits far from the origin (x: 3000, y: 2000)
  // — only reachable if the camera actually refit to it rather than
  // keeping root's (unrelated) panned/zoomed view.
  await expectFullyVisible(page, page.locator('.card'))
  expect(await getView(page)).not.toEqual(panned)

  // Pan/zoom away again, then navigate back out — the reset happens on
  // every entry, not just the first.
  await page.getByTitle('Zoom in').click()
  await page.mouse.wheel(60, 40)
  const pannedAgain = await getView(page)

  await page.locator('.breadcrumb__home').click()
  await expect(page).toHaveURL(/\/$/)
  await expectFullyVisible(page, page.locator('[data-testid="card"]'))
  expect(await getView(page)).not.toEqual(pannedAgain)
})
