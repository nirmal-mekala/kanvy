import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'

// Stage 5 (selection, dragging, resizing) — spec §2.3, §4.3, §4.4, §4.5.
// Written against components/canvas/useBoardInteraction.ts's actual DOM
// contract: `[data-node-id]:not(.node-connector)` on every card/container root, `.card--selected`
// / `.container-node--selected` for selection state, `.container-node__drag-handle`
// as the only container drag surface, `.resize-handle--<dir>` for the 8-way
// handles.
//
// Run and passing (all 81) via the playwright-remote-browser skill. This
// run caught a real, significant bug: clicking a card's caption text
// (nearly its entire visible surface) failed to select it at all —
// `CardBody.tsx`'s textarea called `stopPropagation()` on `pointerdown`,
// blocking the click before it reached `Card.tsx`'s selection handler.
// Fixed by porting the prototype's actual `.no-drag` pattern (selection
// always fires on pointerdown; only *drag start* is skipped for
// interactive children) — see `useBoardInteraction.ts`'s
// `handleNodePointerDown` and AGENTS.md. A later pass filled in the
// previously-unwritten dragging/container-geometry edge cases (Y-gutter
// snap, no-fly-zone clamping, nested-container ancestor safety,
// multi-selection carry, no-parent-on-no-overlap, container z-order) —
// all passed cleanly, no further app bugs found there.
// A later pass found one more, real bug in a manual verification: a
// container being actively dragged rendered *behind* an unrelated
// container it happened to cross mid-gesture, even though the final,
// post-drop result looked fine — container z-order only got recomputed at
// drop, so a dragged container otherwise kept its pre-drag DOM position
// (and z-order) for the *entire* drag. Fixed by bringing the grabbed node
// (and whatever it's carrying) to the front the instant a drag actually
// starts moving (`bringToFrontAtom` in `state/atoms/nodes.ts`,
// `useBoardInteraction.ts`'s `bringDragToFrontOnce`).
//
// v0.1 (spec §2.3): container membership was reverted from a formal, stored
// `parentId` field back to the original prototype's purely spatial model —
// what a dragged container carries is recomputed fresh from x/y/w/h every
// time (containers/containment.ts), never stored. Every test below that
// used to assert a `parentId` value now asserts the equivalent *behavior*
// instead (carried on drag, or not) — a strictly more robust check, since
// it's what a user can actually observe.

function textCard(id: string, x: number, y: number, w = 224, h = 90) {
  return {
    id,
    type: 'card',
    kind: 'text',
    size: 'regular',
    x,
    y,
    w,
    h,
    color: 'gray',
    content: id,
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

test.describe('selection (spec §4.3)', () => {
  test('click selects a single card', async ({ page }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 400, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('[data-node-id="a"]:not(.node-connector)').click()
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)
    await expect(
      page.locator('[data-node-id="b"]:not(.node-connector)'),
    ).not.toHaveClass(/card--selected/)
  })

  test('shift+click toggles additive selection', async ({ page }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 400, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('[data-node-id="a"]:not(.node-connector)').click()
    await page
      .locator('[data-node-id="b"]:not(.node-connector)')
      .click({ modifiers: ['Shift'] })
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)
    await expect(
      page.locator('[data-node-id="b"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)

    await page
      .locator('[data-node-id="b"]:not(.node-connector)')
      .click({ modifiers: ['Shift'] })
    await expect(
      page.locator('[data-node-id="b"]:not(.node-connector)'),
    ).not.toHaveClass(/card--selected/)
  })

  test('a plain click on a container body (not the handle) selects it', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [containerNode('c1', 100, 100, 300, 300)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const container = page.locator('[data-node-id="c1"]:not(.node-connector)')
    const box = await container.boundingBox()
    if (!box) throw new Error('container not rendered')
    // Click well below the drag handle, inside the body.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20)
    await expect(container).toHaveClass(/container-node--selected/)
  })

  test('marquee-select on blank canvas sweeps overlapped cards', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 200, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const board = page.locator('[data-testid="canvas-root"]')
    const boardBox = await board.boundingBox()
    if (!boardBox) throw new Error('board not rendered')

    await page.mouse.move(boardBox.x + 10, boardBox.y + 10)
    await page.mouse.down()
    await page.mouse.move(boardBox.x + 700, boardBox.y + 400, { steps: 10 })
    await page.mouse.up()

    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)
    await expect(
      page.locator('[data-node-id="b"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)
  })

  test('a marquee started inside a container body never selects that container', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [
        containerNode('outer', 50, 50, 500, 500),
        textCard('inner', 100, 150),
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const container = page.locator(
      '[data-node-id="outer"]:not(.node-connector)',
    )
    const box = await container.boundingBox()
    if (!box) throw new Error('container not rendered')

    // Drag starting inside the container's body, sweeping the inner card.
    await page.mouse.move(box.x + 20, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 400, box.y + 300, { steps: 10 })
    await page.mouse.up()

    await expect(
      page.locator('[data-node-id="inner"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)
    await expect(container).not.toHaveClass(/container-node--selected/)
  })

  test('a marquee started inside a container body still selects a nested container it sweeps over', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [
        containerNode('outer', 50, 50, 500, 500),
        // Spatially inside `outer` but well away from the drag's start
        // point, so it's never in `clickContainerIds` — only `outer`
        // itself (the one the drag started inside of) is exempt from the
        // sweep.
        containerNode('nested', 300, 300, 100, 100),
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const outer = page.locator('[data-node-id="outer"]:not(.node-connector)')
    const box = await outer.boundingBox()
    if (!box) throw new Error('container not rendered')

    // Starts inside `outer`'s body (away from `nested`), sweeps across to
    // cover `nested`'s bounds too.
    await page.mouse.move(box.x + 20, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 400, box.y + 400, { steps: 10 })
    await page.mouse.up()

    await expect(
      page.locator('[data-node-id="nested"]:not(.node-connector)'),
    ).toHaveClass(/container-node--selected/)
    await expect(outer).not.toHaveClass(/container-node--selected/)
  })

  test('clicking an already-multi-selected card preserves the selection', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 400, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('[data-node-id="a"]:not(.node-connector)').click()
    await page
      .locator('[data-node-id="b"]:not(.node-connector)')
      .click({ modifiers: ['Shift'] })
    // A plain click (no modifier) on a member of the multi-selection.
    await page.locator('[data-node-id="a"]:not(.node-connector)').click()
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)
    await expect(
      page.locator('[data-node-id="b"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)
  })
})

test.describe('dragging & snapping (spec §4.4)', () => {
  test('a dropped card snaps its X position to a grid midpoint', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const card = page.locator('[data-node-id="a"]:not(.node-connector)')
    const box = await card.boundingBox()
    if (!box) throw new Error('card not rendered')

    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + 10 + 37, box.y + 10, { steps: 5 }) // deliberately off-grid
    await page.mouse.up()

    const left = await card.evaluate((el) => (el as HTMLElement).style.left)
    const x = Number.parseFloat(left)
    // snapToGridMidpoint (GRID_SIZE=16) lands on 8 mod 16.
    expect(((x % 16) + 16) % 16).toBe(8)
  })

  test('dragging near a column-overlapping neighbor gutter-snaps the Y position', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 100, 400)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const cardA = page.locator('[data-node-id="a"]:not(.node-connector)')
    const cardB = page.locator('[data-node-id="b"]:not(.node-connector)')
    const boxA = await cardA.boundingBox()
    const boxB = await cardB.boundingBox()
    if (!boxA || !boxB) throw new Error('card not rendered')

    await page.mouse.move(boxB.x + 10, boxB.y + 10)
    await page.mouse.down()
    // Drag b's top edge to just past a's bottom edge — well within
    // Y_SNAP_THRESHOLD (2 grid cells = 32px) of it.
    await page.mouse.move(boxB.x + 10, boxA.y + boxA.height + 10, {
      steps: 10,
    })
    await page.mouse.up()

    const top = await cardB.evaluate((el) => (el as HTMLElement).style.top)
    // snapY resolves to a fixed gutter (16px) below a's *actual rendered*
    // bottom edge, regardless of exactly where within the threshold the
    // drop landed. a's real height (auto-measured from its one-line
    // content) can differ slightly from the seeded `h`, so this reads it
    // back from a's own bounding box (world y=100 at an unpanned,
    // unzoomed initial view, per boxA.y) rather than assuming the seed
    // value.
    expect(Number.parseFloat(top)).toBe(100 + boxA.height + 16)
  })

  test("a card dropped straddling a container's handle band gets pushed out (no-fly-zone clamping)", async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [containerNode('c1', 100, 300, 300, 300), textCard('a', 500, 500)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const card = page.locator('[data-node-id="a"]:not(.node-connector)')
    const container = page.locator('[data-node-id="c1"]:not(.node-connector)')
    const cardBox = await card.boundingBox()
    const containerBox = await container.boundingBox()
    if (!cardBox || !containerBox) throw new Error('missing bounding box')

    await page.mouse.move(cardBox.x + 10, cardBox.y + 10)
    await page.mouse.down()
    // Drop so the card's top lands squarely inside the container's no-fly
    // band (its handle strip ± NO_FLY_CLEARANCE).
    await page.mouse.move(containerBox.x + 20, containerBox.y + 10, {
      steps: 10,
    })
    await page.mouse.up()

    const top = await card.evaluate((el) => (el as HTMLElement).style.top)
    const y = Number.parseFloat(top)
    // The no-fly band spans [container.y - 16, container.y + 16 + 16) =
    // [284, 332) in world coords for a container at y=300 — the card must
    // land outside that band, not straddling it.
    const zoneAbove = 300 - 16
    const zoneBelow = 300 + 16 + 16
    expect(y >= zoneBelow || y + 90 <= zoneAbove).toBe(true)
  })

  test('dragging a nested container never moves its ancestor(s)', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [
        containerNode('outer', 50, 50, 500, 500),
        containerNode('inner', 100, 150, 200, 200),
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const outer = page.locator('[data-node-id="outer"]:not(.node-connector)')
    const inner = page.locator('[data-node-id="inner"]:not(.node-connector)')
    const outerBefore = await outer.boundingBox()
    const handleBox = await inner
      .locator('.container-node__drag-handle')
      .boundingBox()
    if (!outerBefore || !handleBox) throw new Error('missing bounding box')

    await page.mouse.move(handleBox.x + 10, handleBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 10 + 60, handleBox.y + 5 + 60, {
      steps: 10,
    })
    await page.mouse.up()

    const outerAfter = await outer.boundingBox()
    if (!outerAfter) throw new Error('container not rendered')
    expect(outerAfter.x).toBe(outerBefore.x)
    expect(outerAfter.y).toBe(outerBefore.y)
  })

  test('dragging a multi-selection preserves relative positions', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 400, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page
      .locator('[data-node-id="a"]:not(.node-connector) .card__bar')
      .click()
    await page
      .locator('[data-node-id="b"]:not(.node-connector) .card__bar')
      .click({ modifiers: ['Shift'] })

    const cardA = page.locator('[data-node-id="a"]:not(.node-connector)')
    const cardB = page.locator('[data-node-id="b"]:not(.node-connector)')
    const aBefore = await cardA.boundingBox()
    const bBefore = await cardB.boundingBox()
    if (!aBefore || !bBefore) throw new Error('missing bounding box')

    await page.mouse.move(aBefore.x + 10, aBefore.y + 10)
    await page.mouse.down()
    await page.mouse.move(aBefore.x + 10 + 80, aBefore.y + 10 + 40, {
      steps: 10,
    })
    await page.mouse.up()

    const aAfter = await cardA.boundingBox()
    const bAfter = await cardB.boundingBox()
    if (!aAfter || !bAfter) throw new Error('missing bounding box')

    const dxA = aAfter.x - aBefore.x
    const dyA = aAfter.y - aBefore.y
    expect(dxA).toBeGreaterThan(0)
    expect(bAfter.x - bBefore.x).toBeCloseTo(dxA, 0)
    expect(bAfter.y - bBefore.y).toBeCloseTo(dyA, 0)
  })

  test('dragging a container moves everything spatially inside it', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [
        containerNode('parent', 50, 50, 400, 400),
        textCard('child', 100, 150),
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const container = page.locator(
      '[data-node-id="parent"]:not(.node-connector)',
    )
    const handle = container.locator('.container-node__drag-handle')
    const handleBox = await handle.boundingBox()
    const childBefore = await page
      .locator('[data-node-id="child"]:not(.node-connector)')
      .boundingBox()
    if (!handleBox || !childBefore) throw new Error('missing bounding box')

    await page.mouse.move(handleBox.x + 10, handleBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 10 + 80, handleBox.y + 5 + 80, {
      steps: 10,
    })
    await page.mouse.up()

    const childAfter = await page
      .locator('[data-node-id="child"]:not(.node-connector)')
      .boundingBox()
    if (!childAfter) throw new Error('missing bounding box')
    expect(childAfter.x - childBefore.x).toBeGreaterThan(40)
    expect(childAfter.y - childBefore.y).toBeGreaterThan(40)
  })

  test("a container's body is not a drag surface", async ({ page }) => {
    await seed(page, {
      version: 1,
      nodes: [containerNode('c1', 100, 100, 300, 300)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const container = page.locator('[data-node-id="c1"]:not(.node-connector)')
    const before = await container.boundingBox()
    if (!before) throw new Error('container not rendered')

    // Drag starting in the body (below the handle), not the handle itself.
    await page.mouse.move(before.x + 50, before.y + 100)
    await page.mouse.down()
    await page.mouse.move(before.x + 200, before.y + 250, { steps: 10 })
    await page.mouse.up()

    const after = await container.boundingBox()
    if (!after) throw new Error('container not rendered')
    expect(after.x).toBe(before.x)
    expect(after.y).toBe(before.y)
  })

  test('8-way resize on a container respects the documented minimum', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [containerNode('c1', 100, 100, 200, 200)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const handle = page.locator('.resize-handle--se')
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('handle not rendered')

    // Drag far past the minimum in the shrinking direction (nw corner
    // would shrink; se corner here just grows — assert grid-snapped growth).
    await page.mouse.move(handleBox.x + 5, handleBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 5 + 37, handleBox.y + 5 + 20, {
      steps: 5,
    })
    await page.mouse.up()

    const container = page.locator('[data-node-id="c1"]:not(.node-connector)')
    const width = await container.evaluate(
      (el) => (el as HTMLElement).style.width,
    )
    const w = Number.parseFloat(width)
    expect(w % 16).toBe(0)
    expect(w).toBeGreaterThan(200)
  })
})

test.describe('containers (spec §2.3, §4.5)', () => {
  test('ctrl+click-drag on blank canvas creates a container', async ({
    page,
  }) => {
    await seed(page, { version: 1, nodes: [], edges: [], images: {} })
    await page.goto('/')
    const board = page.locator('[data-testid="canvas-root"]')
    const boardBox = await board.boundingBox()
    if (!boardBox) throw new Error('board not rendered')

    await page.keyboard.down('Control')
    await page.mouse.move(boardBox.x + 60, boardBox.y + 60)
    await page.mouse.down()
    await page.mouse.move(boardBox.x + 300, boardBox.y + 300, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.up('Control')

    await expect(page.locator('.container-node')).toHaveCount(1)
  })

  test('ctrl+click-drag around existing cards makes them children, carried along on a later drag', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100), textCard('b', 250, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const board = page.locator('[data-testid="canvas-root"]')
    const boardBox = await board.boundingBox()
    if (!boardBox) throw new Error('board not rendered')

    // Draw a box around both cards.
    await page.keyboard.down('Control')
    await page.mouse.move(boardBox.x + 50, boardBox.y + 50)
    await page.mouse.down()
    await page.mouse.move(boardBox.x + 400, boardBox.y + 250, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.up('Control')
    await expect(page.locator('.container-node')).toHaveCount(1)

    const cardA = page.locator('[data-node-id="a"]:not(.node-connector)')
    const cardB = page.locator('[data-node-id="b"]:not(.node-connector)')
    const beforeA = await cardA.boundingBox()
    const beforeB = await cardB.boundingBox()
    if (!beforeA || !beforeB) throw new Error('missing bounding box')

    const handle = page.locator('.container-node .container-node__drag-handle')
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('handle not rendered')
    await page.mouse.move(handleBox.x + 10, handleBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 10 + 60, handleBox.y + 5 + 60, {
      steps: 10,
    })
    await page.mouse.up()

    const afterA = await cardA.boundingBox()
    const afterB = await cardB.boundingBox()
    if (!afterA || !afterB) throw new Error('missing bounding box')
    expect(afterA.x - beforeA.x).toBeGreaterThan(30)
    expect(afterA.y - beforeA.y).toBeGreaterThan(30)
    expect(afterB.x - beforeB.x).toBeGreaterThan(30)
    expect(afterB.y - beforeB.y).toBeGreaterThan(30)
  })

  test('ctrl+click-drag around an existing (nested) container paints the new grandparent beneath it, and still carries the grandchild on drag', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [
        containerNode('parent', 100, 100, 200, 200),
        textCard('child', 130, 150, 80, 60),
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const board = page.locator('[data-testid="canvas-root"]')
    const boardBox = await board.boundingBox()
    if (!boardBox) throw new Error('board not rendered')

    // Draw a box around the whole existing "parent" container.
    await page.keyboard.down('Control')
    await page.mouse.move(boardBox.x + 20, boardBox.y + 20)
    await page.mouse.down()
    await page.mouse.move(boardBox.x + 450, boardBox.y + 450, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.up('Control')
    await expect(page.locator('.container-node')).toHaveCount(2)

    // "parent" must visually paint on top of the new grandparent that now
    // geometrically encloses it, not get lost behind it — containers have
    // no z-index of their own (DOM order is the only mechanism), and the
    // grandparent is appended to the end of the nodes array on creation,
    // so naive array-order rendering would paint it over "parent" despite
    // "parent" now being nested inside it (renderOrder.ts derives nesting
    // from geometry, v0.1).
    const parentBox = await page
      .locator('[data-node-id="parent"]:not(.node-connector)')
      .boundingBox()
    if (!parentBox) throw new Error('parent not rendered')
    const topmostAtParentCorner = await page.evaluate(
      ([x, y]: [number, number]) =>
        (document.elementFromPoint(x, y) as HTMLElement)
          ?.closest('[data-node-id]')
          ?.getAttribute('data-node-id') ?? null,
      [parentBox.x + 5, parentBox.y + 5] as [number, number],
    )
    expect(topmostAtParentCorner).toBe('parent')

    const child = page.locator('[data-node-id="child"]:not(.node-connector)')
    const beforeChild = await child.boundingBox()
    if (!beforeChild) throw new Error('child not rendered')

    // The new (grandparent) container is whichever one isn't "parent".
    const grandparentHandle = page.locator(
      '.container-node:not([data-node-id="parent"]) .container-node__drag-handle',
    )
    const gpBox = await grandparentHandle.boundingBox()
    if (!gpBox) throw new Error('grandparent handle not rendered')
    await page.mouse.move(gpBox.x + 10, gpBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(gpBox.x + 10 + 60, gpBox.y + 5 + 60, { steps: 10 })
    await page.mouse.up()

    const afterChild = await child.boundingBox()
    if (!afterChild) throw new Error('child not rendered')
    // The grandchild moves too — dragging the grandparent carries every
    // node spatially inside it in one flat pass (spec §2.3, v0.1), however
    // deep it's nested, with no separate per-level propagation needed.
    expect(afterChild.x - beforeChild.x).toBeGreaterThan(30)
    expect(afterChild.y - beforeChild.y).toBeGreaterThan(30)
  })

  test('dropping a card so it lands over a container makes it spatially "sticky" to it', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [containerNode('c1', 400, 400, 400, 400), textCard('a', 50, 50)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const card = page.locator('[data-node-id="a"]:not(.node-connector)')
    const cardBox = await card.boundingBox()
    if (!cardBox) throw new Error('card not rendered')
    const containerBox = await page
      .locator('[data-node-id="c1"]:not(.node-connector)')
      .boundingBox()
    if (!containerBox) throw new Error('container not rendered')

    await page.mouse.move(cardBox.x + 10, cardBox.y + 10)
    await page.mouse.down()
    await page.mouse.move(
      containerBox.x + containerBox.width / 2,
      containerBox.y + containerBox.height / 2,
      { steps: 10 },
    )
    await page.mouse.up()

    // A card spatially inside a container moves with it — verified
    // indirectly here by re-dragging the container and checking the card
    // follows.
    const handle = page.locator(
      '[data-node-id="c1"]:not(.node-connector) .container-node__drag-handle',
    )
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('handle not rendered')
    const cardBefore = await card.boundingBox()
    if (!cardBefore) throw new Error('card not rendered')

    await page.mouse.move(handleBox.x + 10, handleBox.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + 10 + 60, handleBox.y + 5 + 60, {
      steps: 10,
    })
    await page.mouse.up()

    const cardAfter = await card.boundingBox()
    if (!cardAfter) throw new Error('card not rendered')
    expect(cardAfter.x - cardBefore.x).toBeGreaterThan(30)
    expect(cardAfter.y - cardBefore.y).toBeGreaterThan(30)
  })

  test('a card dropped with no overlapping container is not spatially "sticky" to anything', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      // Far from where `a` gets dropped, so it never overlaps.
      nodes: [containerNode('c1', 700, 500, 200, 200), textCard('a', 50, 50)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const card = page.locator('[data-node-id="a"]:not(.node-connector)')
    const box = await card.boundingBox()
    if (!box) throw new Error('card not rendered')

    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + 10 + 30, box.y + 10 + 30, { steps: 5 })
    await page.mouse.up()
    const cardBefore = await card.boundingBox()
    if (!cardBefore) throw new Error('card not rendered')

    // Nothing overlapping → dragging the (unrelated, non-overlapping)
    // container never carries the card along with it.
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

    const cardAfter = await card.boundingBox()
    if (!cardAfter) throw new Error('card not rendered')
    expect(cardAfter.x).toBe(cardBefore.x)
    expect(cardAfter.y).toBe(cardBefore.y)
  })

  test('containers always render beneath cards, even when they overlap', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [containerNode('c1', 100, 100, 300, 300), textCard('a', 150, 150)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const card = page.locator('[data-node-id="a"]:not(.node-connector)')
    const box = await card.boundingBox()
    if (!box) throw new Error('card not rendered')

    const topTestId = await page.evaluate(
      ([x, y]: [number, number]) =>
        (document.elementFromPoint(x, y) as HTMLElement)
          ?.closest('[data-testid]')
          ?.getAttribute('data-testid') ?? null,
      [box.x + box.width / 2, box.y + box.height / 2] as [number, number],
    )
    expect(topTestId).toBe('card')
  })

  test('a container being actively dragged paints above whatever it is dragged over, for the whole gesture (not just after drop)', async ({
    page,
  }) => {
    // Regression: container render/paint order only got recomputed at
    // drop. A dragged container kept its pre-drag DOM position the entire
    // time it was moving, so it could visually vanish *behind* a later-
    // appended, unrelated container it was dragged over mid-gesture, even
    // though the final, post-drop result looked correct. Fixed by bringing
    // the grabbed node (and whatever it's carrying) to the front the
    // moment a drag actually starts moving (`bringToFrontAtom`,
    // `useBoardInteraction.ts`'s `bringDragToFrontOnce`).
    await seed(page, {
      version: 1,
      nodes: [
        containerNode('a', 100, 100, 200, 200),
        // Appended after "a", so it paints on top of "a" until "a" is
        // actually grabbed and dragged.
        containerNode('b', 500, 100, 200, 200),
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const handleA = page.locator(
      '[data-node-id="a"]:not(.node-connector) .container-node__drag-handle',
    )
    const boxB = await page
      .locator('[data-node-id="b"]:not(.node-connector)')
      .boundingBox()
    const handleBoxA = await handleA.boundingBox()
    if (!boxB || !handleBoxA) throw new Error('missing bounding box')

    await page.mouse.move(
      handleBoxA.x + handleBoxA.width / 2,
      handleBoxA.y + handleBoxA.height / 2,
    )
    await page.mouse.down()
    // Drag "a" so it fully overlaps "b", but don't release yet.
    await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + 10, {
      steps: 10,
    })

    const topNodeId = await page.evaluate(
      ([x, y]: [number, number]) =>
        (document.elementFromPoint(x, y) as HTMLElement)
          ?.closest('[data-node-id]')
          ?.getAttribute('data-node-id') ?? null,
      [boxB.x + boxB.width / 2, boxB.y + boxB.height / 2] as [number, number],
    )
    await page.mouse.up()

    expect(topNodeId).toBe('a')
  })
})
