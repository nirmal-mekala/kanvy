import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'
import { dispatchPaste } from './fixtures/clipboard'
import { mockLinkMetadata } from './fixtures/linkMetadata'

// Stage 6 (card-kind behavior & connections) — spec §4.6, §5.
// Written against the actual DOM contract: `[data-node-id]:not(.node-connector)` on every
// card/container root, `.card--image`/`.card--link` kind classes,
// `.node-connector--<side>` connector affordances, `.edge` / `[data-edge-id]`
// for rendered edges, `.edge-direction-control__btn` for the minimal
// direction toggle.
//
// Run and passing (all 9) via the playwright-remote-browser skill. This
// run caught a real bug: the edge direction-toggle buttons had no click
// at all (missing `stopPropagation`, same class of bug as the zoom/help
// buttons — see AGENTS.md). The direction-toggle spec also had to stop
// clicking the edge's `<g>` by bounding-box center (unreliable for a
// curved bezier path) and dispatch straight to `.edge__hit` instead.

function textCard(id: string, x: number, y: number, content = '') {
  return {
    id,
    type: 'card',
    kind: 'text',
    size: 'regular',
    x,
    y,
    w: 224,
    h: 90,
    color: 'gray',
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

async function seed(page: import('@playwright/test').Page, board: unknown) {
  await seedBoard(page, board, 'kanvy.board')
}

test.describe('card-kind behavior (spec §5)', () => {
  test('pasting a URL alone with nothing selected creates a link card', async ({
    page,
  }) => {
    await mockLinkMetadata(page, { status: 'ready', title: 'Example Site' })
    await seed(page, { version: 1, nodes: [], edges: [], images: {} })
    await page.goto('/')
    await dispatchPaste(page, { text: 'https://example.com' })
    const linkCard = page.locator('.card--link')
    await expect(linkCard).toHaveCount(1)
    await expect(linkCard.locator('.card__link-title-text')).toHaveText(
      'Example Site',
    )
  })

  test('pasting a URL onto a focused text card converts it in place', async ({
    page,
  }) => {
    await mockLinkMetadata(page, { status: 'ready', title: 'Converted' })
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100, 'hello')],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page
      .locator('[data-node-id="a"]:not(.node-connector) .card__content')
      .focus()
    await dispatchPaste(
      page,
      { text: 'https://example.com' },
      '[data-node-id="a"]:not(.node-connector)',
    )
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--link/)
  })

  test('a slow link-metadata response eventually resolves via retry', async ({
    page,
  }) => {
    await mockLinkMetadata(page, {
      status: 'ready',
      title: 'Slow Site',
      delayMs: 500,
    })
    await seed(page, { version: 1, nodes: [], edges: [], images: {} })
    await page.goto('/')
    await dispatchPaste(page, { text: 'https://example.com' })
    await expect(page.locator('.card__link-title-text')).toHaveText('Loading…')
    await expect(page.locator('.card__link-title-text')).toHaveText(
      'Slow Site',
      { timeout: 5000 },
    )
  })

  test('typing a URL then a space slurps it into a link card', async ({
    page,
  }) => {
    await mockLinkMetadata(page, { status: 'ready', title: 'Typed Link' })
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const textarea = page.locator(
      '[data-node-id="a"]:not(.node-connector) .card__content',
    )
    await textarea.click()
    await textarea.fill('hello https://example.com ')
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--link/)
  })

  test('kind conversion resets size to regular', async ({ page }) => {
    await mockLinkMetadata(page, { status: 'ready' })
    await seed(page, {
      version: 1,
      nodes: [
        {
          ...textCard('a', 100, 100),
          size: 'big',
          w: 320,
          h: 240,
        },
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('[data-node-id="a"]:not(.node-connector)').click()
    await dispatchPaste(
      page,
      { text: 'https://example.com' },
      '[data-node-id="a"]:not(.node-connector)',
    )
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).not.toHaveClass(/card--big/)
  })
})

test.describe('connections (spec §4.6)', () => {
  test('a connector affordance appears on hover', async ({ page }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 500, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('[data-node-id="a"]:not(.node-connector)').hover()
    await expect(
      page.locator(
        '[data-node-id="a"]:not(.node-connector) .node-connector--right',
      ),
    ).toBeVisible()
  })

  test('dragging from a connector to another node creates an edge', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 500, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('[data-node-id="a"]:not(.node-connector)').hover()
    const connector = page.locator(
      '[data-node-id="a"]:not(.node-connector) .node-connector--right',
    )
    const box = await connector.boundingBox()
    const targetBox = await page
      .locator('[data-node-id="b"]:not(.node-connector)')
      .boundingBox()
    if (!box || !targetBox) throw new Error('missing bounding box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
    )
    await page.mouse.up()
    await expect(page.locator('[data-edge-id]')).toHaveCount(1)
  })

  test('a second attempt to connect the same pair selects the existing edge instead of duplicating it', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 500, 100)],
      edges: [
        {
          id: 'e1',
          fromNodeId: 'a',
          fromSide: 'right',
          toNodeId: 'b',
          toSide: 'left',
          direction: 'none',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      images: {},
    })
    await page.goto('/')
    await expect(page.locator('[data-edge-id]')).toHaveCount(1)
    // Re-drawing the same pair should not add a second edge.
    await page.locator('[data-node-id="a"]:not(.node-connector)').hover()
    const connector = page.locator(
      '[data-node-id="a"]:not(.node-connector) .node-connector--right',
    )
    const box = await connector.boundingBox()
    const targetBox = await page
      .locator('[data-node-id="b"]:not(.node-connector)')
      .boundingBox()
    if (!box || !targetBox) throw new Error('missing bounding box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
    )
    await page.mouse.up()
    await expect(page.locator('[data-edge-id]')).toHaveCount(1)
  })

  test('direction toggle sets an arrow on the selected edge', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 500, 100)],
      edges: [
        {
          id: 'e1',
          fromNodeId: 'a',
          fromSide: 'right',
          toNodeId: 'b',
          toSide: 'left',
          direction: 'none',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      images: {},
    })
    await page.goto('/')
    // A plain `.click()` targets the `<g>`'s bounding-box center, which
    // for a curved bezier edge isn't reliably on the stroke (the only
    // part of the path that's actually hit-testable — see
    // `.edge__hit`'s `pointer-events: stroke` in index.css). Dispatch
    // straight to the hit path instead, matching the real
    // `onPointerDown`-based selection handler it carries.
    await page
      .locator('[data-edge-id="e1"] .edge__hit')
      .dispatchEvent('pointerdown', { button: 0 })
    await page.locator('.edge-direction-control__btn', { hasText: '→' }).click()
    await expect(
      page.locator('[data-edge-id="e1"] .edge__line'),
    ).toHaveAttribute('marker-end', /edge-arrow/)
  })
})
