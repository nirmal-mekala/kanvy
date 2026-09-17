import { expect, test } from '@playwright/test'
import { CHILD_BOARD_ID, childBoardDocument, seedBoard } from './fixtures/board'
import { dispatchPaste } from './fixtures/clipboard'
import { dispatchImageFileDrop } from './fixtures/dragDrop'
import { mockLinkMetadata } from './fixtures/linkMetadata'
import { makeImageDataUri } from './fixtures/testImage'

// Stage 6 (card-kind behavior & connections) — spec §4.6, §5.
// Written against the actual DOM contract: `[data-node-id]:not(.node-connector)` on every
// card/container root, `.card--image`/`.card--link` kind classes,
// `.node-connector--<side>` connector affordances, `.edge` / `[data-edge-id]`
// for rendered edges, `.edge-direction-control__btn` for the minimal
// direction toggle.
//
// Run and passing (all 21) via the playwright-remote-browser skill. This
// run caught a real bug: the edge direction-toggle buttons had no click
// at all (missing `stopPropagation`, same class of bug as the zoom/help
// buttons — see AGENTS.md). The direction-toggle spec also had to stop
// clicking the edge's `<g>` by bounding-box center (unreliable for a
// curved bezier path) and dispatch straight to `.edge__hit` instead. A
// later pass added the `image cards` and `big-text cards` describe
// blocks (previously unwritten scenarios) — both passed cleanly, no app
// bugs found there. A later pass added a "node creation lands inside a
// container" block, verifying a card created (double-click) or an image
// dropped inside a container's bounds is carried along when that
// container is later dragged — v0.1 (spec §2.3) made this automatic:
// there's no `parentId` to assign at creation time, containment is purely
// spatial (x/y/w/h), re-derived fresh whenever something is dragged.
// A later pass renamed the single "big text" size to `h1` and added `h2`/
// `h3` — same free-8-way-resize/truncate/image-link-incompatible mechanics
// across all three, only the rendered font size differs (spec §5.2). The
// `big-text cards` describe block became `heading cards`, parametrized
// across all three levels, plus a new test proving the selection menu's
// heading-to-heading switches (e.g. h1 → h2) preserve the current
// user-resized box instead of resetting it — only regular↔heading
// transitions touch width/height.

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

function containerNode(id: string, x: number, y: number, w: number, h: number) {
  return {
    id,
    type: 'container',
    pattern: 'none',
    color: 'gray',
    x,
    y,
    w,
    h,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

async function seed(page: import('@playwright/test').Page, board: unknown) {
  await seedBoard(page, board, 'kanvy.board')
}

// Autosave is debounced (500ms — state/persistence/storage.ts's
// `createDebouncedSaver`), so reading node state back out of localStorage
// right after a gesture needs to wait past it.
async function readBoardNodes(
  page: import('@playwright/test').Page,
): Promise<{ id: string; type: string }[]> {
  await page.waitForTimeout(600)
  const raw = await page.evaluate(() => localStorage.getItem('kanvy.board'))
  const board = JSON.parse(raw ?? '{"nodes":[]}') as {
    nodes: { id: string; type: string }[]
  }
  return board.nodes
}

test.describe('card-kind behavior (spec §5)', () => {
  test('pasting a URL alone with nothing selected creates a link card', async ({
    page,
  }) => {
    await mockLinkMetadata(page, { status: 'ready', title: 'Example Site' })
    await seed(page, childBoardDocument([]))
    await page.goto(`/board/${CHILD_BOARD_ID}`)
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
    await seed(page, childBoardDocument([]))
    await page.goto(`/board/${CHILD_BOARD_ID}`)
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
          size: 'h1',
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
    ).not.toHaveClass(/card--h1/)
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
    await page.locator('.edge-direction-control__btn[title="Forward"]').click()
    await expect(
      page.locator('[data-edge-id="e1"] .edge__arrowhead'),
    ).toBeAttached()
  })
})

test.describe('image cards (spec §5.3)', () => {
  test('dropping an image file onto blank canvas creates an image card', async ({
    page,
  }) => {
    await seed(page, childBoardDocument([]))
    await page.goto(`/board/${CHILD_BOARD_ID}`)
    const dataUri = await makeImageDataUri(page, 100, 60)
    const board = page.locator('[data-testid="canvas-root"]')
    const boardBox = await board.boundingBox()
    if (!boardBox) throw new Error('board not rendered')

    await dispatchImageFileDrop(
      page,
      dataUri,
      boardBox.x + 200,
      boardBox.y + 200,
    )

    const imageCard = page.locator('.card--image')
    await expect(imageCard).toHaveCount(1)
    await expect(imageCard.locator('img.card__image')).toBeVisible()
  })

  test('pasting an image with nothing selected creates a new image card', async ({
    page,
  }) => {
    await seed(page, childBoardDocument([]))
    await page.goto(`/board/${CHILD_BOARD_ID}`)
    const dataUri = await makeImageDataUri(page, 100, 60)
    await dispatchPaste(page, { imageDataUri: dataUri })
    await expect(page.locator('.card--image')).toHaveCount(1)
  })

  test('pasting an image with a container (not a card) selected still creates a new image card, not a conversion', async ({
    page,
  }) => {
    await seed(
      page,
      childBoardDocument([containerNode('c1', 100, 100, 300, 300)]),
    )
    await page.goto(`/board/${CHILD_BOARD_ID}`)
    await page
      .locator(
        '[data-node-id="c1"]:not(.node-connector) .container-node__drag-handle',
      )
      .click()
    await expect(
      page.locator('[data-node-id="c1"]:not(.node-connector)'),
    ).toHaveClass(/container-node--selected/)

    const dataUri = await makeImageDataUri(page, 100, 60)
    await dispatchPaste(page, { imageDataUri: dataUri })

    await expect(page.locator('.card--image')).toHaveCount(1)
    // The container itself never became an image card.
    await expect(
      page.locator('[data-node-id="c1"]:not(.node-connector)'),
    ).toHaveClass(/container-node/)
  })

  test('pasting an image onto a focused text card converts it in place', async ({
    page,
  }) => {
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
    const dataUri = await makeImageDataUri(page, 100, 60)
    await dispatchPaste(
      page,
      { imageDataUri: dataUri },
      '[data-node-id="a"]:not(.node-connector)',
    )

    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--image/)
    await expect(page.locator('.card--image')).toHaveCount(1)
  })

  test('an oversized image is downsized before being stored (spec §2.6)', async ({
    page,
  }) => {
    await seed(page, childBoardDocument([]))
    await page.goto(`/board/${CHILD_BOARD_ID}`)
    // MAX_IMAGE_DIMENSION (cards/imageFile.ts) is 1200 — well past it on
    // the long edge.
    const dataUri = await makeImageDataUri(page, 2000, 1000)
    await dispatchPaste(page, { imageDataUri: dataUri })

    const img = page.locator('.card--image img.card__image')
    await expect(img).toBeVisible()
    const { naturalWidth, naturalHeight, src } = await img.evaluate(
      (el: HTMLImageElement) => ({
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        src: el.src,
      }),
    )
    expect(src.startsWith('data:')).toBe(true)
    // 2000x1000 downsized to a long edge of 1200 → 1200x600.
    expect(naturalWidth).toBe(1200)
    expect(naturalHeight).toBe(600)
  })
})

test.describe('heading cards (spec §5.2)', () => {
  for (const size of ['h1', 'h2', 'h3'] as const) {
    test(`${size}: resizes via its handles, grid-snapped, and truncates overflow instead of scrolling`, async ({
      page,
    }) => {
      await seed(page, {
        version: 1,
        nodes: [
          {
            ...textCard(
              'a',
              100,
              100,
              'a '.repeat(200), // long enough to overflow the fixed height
            ),
            size,
            w: 320,
            h: 240,
          },
        ],
        edges: [],
        images: {},
      })
      await page.goto('/')
      const card = page.locator('[data-node-id="a"]:not(.node-connector)')
      await expect(card).toHaveClass(new RegExp(`card--${size}`))

      // Truncated, not scrolled: overflow hidden despite content taller
      // than the fixed box — identical mechanics across every heading
      // level, only the font size (CSS) differs.
      const textarea = card.locator('.card__content')
      const overflowsButHidden = await textarea.evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          overflowY: style.overflowY,
          overflows: el.scrollHeight > el.clientHeight,
        }
      })
      expect(overflowsButHidden.overflows).toBe(true)
      expect(overflowsButHidden.overflowY).toBe('hidden')

      // Resize via the se handle, grid-snapped, past the documented minimum.
      const handle = page.locator(
        '[data-node-id="a"]:not(.node-connector) .resize-handle--se',
      )
      const handleBox = await handle.boundingBox()
      if (!handleBox) throw new Error('handle not rendered')

      await page.mouse.move(handleBox.x + 5, handleBox.y + 5)
      await page.mouse.down()
      await page.mouse.move(handleBox.x + 5 + 53, handleBox.y + 5 + 37, {
        steps: 5,
      })
      await page.mouse.up()

      const box = await card.evaluate((el) => ({
        w: Number.parseFloat((el as HTMLElement).style.width),
        h: Number.parseFloat((el as HTMLElement).style.height),
      }))
      expect(box.w % 16).toBe(0)
      expect(box.h % 16).toBe(0)
      expect(box.w).toBeGreaterThan(320)
      expect(box.h).toBeGreaterThan(240)
    })
  }

  test('the selection menu toggles between regular and each heading level, preserving size across heading-to-heading switches', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page
      .locator('[data-node-id="a"]:not(.node-connector) .card__bar')
      .click()
    const card = page.locator('[data-node-id="a"]:not(.node-connector)')

    // regular -> h1: seeds the heading default box (no prior heading size
    // to preserve from).
    await page.locator('.textsize-swatch[title="Heading 1"]').click()
    await expect(card).toHaveClass(/card--h1/)
    const afterH1 = await card.evaluate((el) => ({
      w: Number.parseFloat((el as HTMLElement).style.width),
      h: Number.parseFloat((el as HTMLElement).style.height),
    }))
    expect(afterH1.w).toBeGreaterThan(224) // wider than CARD_WIDTH

    // Resize it by hand, then switch h1 -> h2: relabels only, keeps the box.
    const handle = page.locator(
      '[data-node-id="a"]:not(.node-connector) .resize-handle--se',
    )
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('handle not rendered')
    await page.mouse.move(handleBox.x + 5, handleBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 5 + 80, handleBox.y + 5 + 64, {
      steps: 5,
    })
    await page.mouse.up()
    const afterResize = await card.evaluate((el) => ({
      w: Number.parseFloat((el as HTMLElement).style.width),
      h: Number.parseFloat((el as HTMLElement).style.height),
    }))

    await page.locator('.textsize-swatch[title="Heading 2"]').click()
    await expect(card).toHaveClass(/card--h2/)
    await expect(card).not.toHaveClass(/card--h1/)
    const afterH2 = await card.evaluate((el) => ({
      w: Number.parseFloat((el as HTMLElement).style.width),
      h: Number.parseFloat((el as HTMLElement).style.height),
    }))
    expect(afterH2).toEqual(afterResize)

    // h2 -> regular: resets width back to CARD_WIDTH.
    await page.locator('.textsize-swatch[title="Regular text"]').click()
    await expect(card).not.toHaveClass(/card--h2/)
    const afterRegular = await card.evaluate(
      (el) => (el as HTMLElement).style.width,
    )
    expect(Number.parseFloat(afterRegular)).toBe(224)
  })
})

test.describe('node creation lands inside a container it is drawn/dropped in (spec §2.3, v0.1)', () => {
  test('double-click on blank canvas creates a new text card', async ({
    page,
  }) => {
    await seed(page, childBoardDocument([]))
    await page.goto(`/board/${CHILD_BOARD_ID}`)
    const board = page.locator('[data-testid="canvas-root"]')
    const boardBox = await board.boundingBox()
    if (!boardBox) throw new Error('board not rendered')

    await page.mouse.dblclick(boardBox.x + 200, boardBox.y + 200)

    await expect(page.locator('[data-testid="card"]')).toHaveCount(1)
    // Not a `.card--board` — proves this landed as an actual text card,
    // not a board card (which is what double-click creates on root
    // instead, multiboard support design doc §3).
    await expect(page.locator('.card--board')).toHaveCount(0)
  })

  test('double-clicking inside a container creates a card that is carried along when the container is later dragged', async ({
    page,
  }) => {
    await seed(
      page,
      childBoardDocument([containerNode('c1', 100, 100, 300, 300)]),
    )
    await page.goto(`/board/${CHILD_BOARD_ID}`)
    const box = await page
      .locator('[data-node-id="c1"]:not(.node-connector)')
      .boundingBox()
    if (!box) throw new Error('container not rendered')

    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)

    await expect(page.locator('[data-testid="card"]')).toHaveCount(1)
    // Proves this is an actual text card, not a board card (design doc §3).
    await expect(page.locator('.card--board')).toHaveCount(0)
    const nodes = await readBoardNodes(page)
    const card = nodes.find((n) => n.type === 'card')

    // Carried along when the container is dragged — the only observable
    // proof of spatial containment there is, with no stored parentId.
    const cardLoc = page.locator(
      `[data-node-id="${card?.id}"]:not(.node-connector)`,
    )
    const before = await cardLoc.boundingBox()
    if (!before) throw new Error('card not rendered')
    const handle = page.locator(
      '[data-node-id="c1"]:not(.node-connector) .container-node__drag-handle',
    )
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('handle not rendered')
    await page.mouse.move(handleBox.x + 10, handleBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 10 + 60, handleBox.y + 5 + 60, {
      steps: 10,
    })
    await page.mouse.up()

    const after = await cardLoc.boundingBox()
    if (!after) throw new Error('card not rendered')
    expect(after.x - before.x).toBeGreaterThan(30)
    expect(after.y - before.y).toBeGreaterThan(30)
  })

  test('dropping an image file inside a container creates a card that is carried along when the container is later dragged', async ({
    page,
  }) => {
    await seed(
      page,
      childBoardDocument([containerNode('c1', 100, 100, 300, 300)]),
    )
    await page.goto(`/board/${CHILD_BOARD_ID}`)
    const box = await page
      .locator('[data-node-id="c1"]:not(.node-connector)')
      .boundingBox()
    if (!box) throw new Error('container not rendered')

    const dataUri = await makeImageDataUri(page, 100, 60)
    await dispatchImageFileDrop(
      page,
      dataUri,
      box.x + box.width / 2,
      box.y + box.height / 2,
    )

    await expect(page.locator('.card--image')).toHaveCount(1)
    const cardLoc = page.locator('.card--image')
    const before = await cardLoc.boundingBox()
    if (!before) throw new Error('card not rendered')
    const handle = page.locator(
      '[data-node-id="c1"]:not(.node-connector) .container-node__drag-handle',
    )
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('handle not rendered')
    await page.mouse.move(handleBox.x + 10, handleBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 10 + 60, handleBox.y + 5 + 60, {
      steps: 10,
    })
    await page.mouse.up()

    const after = await cardLoc.boundingBox()
    if (!after) throw new Error('card not rendered')
    expect(after.x - before.x).toBeGreaterThan(30)
    expect(after.y - before.y).toBeGreaterThan(30)
  })
})
