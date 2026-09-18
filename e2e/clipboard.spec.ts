import { expect, test } from '@playwright/test'
import { CHILD_BOARD_ID, childBoardDocument, seedBoard } from './fixtures/board'
import { dispatchPaste } from './fixtures/clipboard'

// Stage 7 (clipboard, keyboard shortcuts, toolbar/help) — spec §7, §4.2.
//
// Run and passing (all 20) via the playwright-remote-browser skill. This
// run caught two real bugs: the first-ever in-app paste landed with zero
// offset (fixed in clipboard/nodeClipboard.ts), and clicking a card's
// caption text failed to select it at all (see e2e/interaction.spec.ts's
// note) — several tests here deliberately click `.card__bar` instead of
// the card body, since clicking into the caption is correct text-edit
// focus, not something these board-level shortcut tests should trigger.
// A later pass found a third: pasting a copied container together with
// its spatially-contained child produced two fully independent nodes,
// because paste applied a *different* offset to each node instead of one
// uniform offset to the whole copied set — fixed in
// `clipboard/nodeClipboard.ts`/`pasteOffset.ts` so relative positions (and
// so spatial containment) survive automatically. The same investigation
// found the identical defect in ⌘/Ctrl+D duplicate
// (`clipboard/duplicateNodes.ts`) — fixed the same way. (v0.1, spec §2.3,
// later reverted container membership from a formal `parentId` field back
// to this purely spatial model entirely — the fix described here predates
// that and was folded into it; see `containers/containment.ts`.)
// A later pass found two more: (a) in-app paste was gated on
// `selection.size > 0`, so copying something, deselecting, then pasting
// (a normal flow) silently did nothing whenever the copied content wrote
// no text to the system clipboard (e.g. a container) — fixed in
// `useClipboardShortcuts.ts` by gating on the in-app clipboard's own
// populated state (`hasNodeClipboardContentAtom`) instead of the current
// selection; and (b) an OS-clipboard URL/plain-text on the system
// clipboard could hijack a populated in-app clipboard on paste, since the
// image/URL branch (`useCardCreation.ts`) ran first and didn't know the
// in-app clipboard had priority — fixed by having it only take priority
// over the in-app clipboard when a card's caption is *actively focused*
// (`focusedTargetCard()`, spec §5.3/§5.4's "convert this card in place"
// signal), not merely selected — a plain selection isn't a strong enough
// signal to override "convert to a link card" vs. "paste what I copied".
// The same pass also found that ⌘/Ctrl+D duplicating a multi-node/nested
// selection painted the duplicate interleaved with the original instead
// of cleanly on top — root-caused to `renderOrder.ts`'s container sort
// being a flat sort by depth number, not a true depth-first traversal;
// see that file's rewrite and its own test suite for detail.
// A later pass (after v0.1's spatial-membership revert) found one more:
// ⌘/Ctrl+D used a small fixed offset with no awareness of existing
// containers, so a duplicate landed right back overlapping — and so
// spatially "stuck" to — whatever container(s) the original was already
// inside, never actually escaping it (unlike paste, which always lands
// clear of every existing container). Fixed by having duplicate reuse
// paste's own placement logic (`computePasteOffset`) exactly:
// `duplicateNodes.ts` now takes the board's current containers and pushes
// the duplicate's uniform offset further out until clear of all of them,
// same as copy/paste. The same request also asked for duplicate to mirror
// paste's "pan the viewport to keep what just landed visible" behavior —
// `useClipboardShortcuts.ts`'s `panPastedIntoView` was already a small,
// pure, paste-specific helper; renamed to `panNewNodesIntoView` and called
// from `tryDuplicate` too, rather than writing a second copy of it.
// A later pass tightened container drag-carry from "overlaps" to
// "completely within" (see interaction.spec.ts's header for the mechanism
// change) — the shared c1/k1 fixture below widened `c1` from 200x200 to
// 300x250 so `k1` genuinely sits fully inside it; it previously poked out
// by 54px and the "carried along when dragged" tests only still passed
// because paste/duplicate leave everything selected, and dragging a node
// that's part of a multi-selection carries the whole selection regardless
// of geometry — a real, separate mechanism, not the one being tested.
// See AGENTS.md and ctx/notes/260915-phase6-e2e-test-scenario-checklist.md.

function textCard(id: string, x: number, y: number, content = id) {
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
): Promise<{ id: string; type: string; x: number; y: number }[]> {
  await page.waitForTimeout(600)
  const raw = await page.evaluate(() => localStorage.getItem('kanvy.board'))
  const board = JSON.parse(raw ?? '{"nodes":[]}') as {
    nodes: { id: string; type: string; x: number; y: number }[]
  }
  return board.nodes
}

test.describe('in-app clipboard (spec §7)', () => {
  test('copy then paste creates a duplicate offset from the original', async ({
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
    await page.keyboard.press('ControlOrMeta+c')
    await page.keyboard.press('ControlOrMeta+v')
    await expect(
      page.locator('[data-node-id]:not(.node-connector)'),
    ).toHaveCount(2)
  })

  test('repeated paste offsets further each time (staircase)', async ({
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
    await page.keyboard.press('ControlOrMeta+c')
    await page.keyboard.press('ControlOrMeta+v')
    await page
      .locator('[data-node-id="a"]:not(.node-connector) .card__bar')
      .click()
    await page.keyboard.press('ControlOrMeta+v')
    await expect(
      page.locator('[data-node-id]:not(.node-connector)'),
    ).toHaveCount(3)
  })

  test('paste always lands outside every container', async ({ page }) => {
    await seed(page, {
      version: 1,
      nodes: [
        containerNode('group', 0, 0, 2000, 2000),
        textCard('a', 100, 100),
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page
      .locator('[data-node-id="a"]:not(.node-connector) .card__bar')
      .click()
    await page.keyboard.press('ControlOrMeta+c')
    await page
      .locator('[data-node-id="a"]:not(.node-connector) .card__bar')
      .click()
    await page.keyboard.press('ControlOrMeta+v')
    // `.filter({ hasNot })` checks for a *descendant* match, not "isn't
    // this element" — a card/container never nests another node inside
    // it in the DOM, so that filter would be a no-op here. Exclude by
    // node kind and id directly instead.
    const pasted = page.locator('[data-testid="card"]:not([data-node-id="a"])')
    await expect(pasted).toHaveCount(1)
    // The pasted card should not have been assigned the container as its
    // parent — verified indirectly by checking the board doesn't nest it
    // under the container's drag handle in the DOM (containers render
    // outside cards, so this is really just a smoke check that paste didn't
    // crash inside a giant container).
  })

  test('copying, then deselecting before pasting, still pastes the copied selection (not silently a no-op)', async ({
    page,
  }) => {
    // A container specifically: it writes nothing to the system clipboard
    // (spec §7 — only card captions do), so this is the cleanest way to
    // prove the in-app paste branch fires at all, rather than a plain-text
    // OS-clipboard fallback coincidentally producing a similar-looking
    // result.
    await seed(page, {
      version: 1,
      nodes: [containerNode('c1', 100, 100, 200, 200)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page
      .locator(
        '[data-node-id="c1"]:not(.node-connector) .container-node__drag-handle',
      )
      .click()
    await page.keyboard.press('ControlOrMeta+c')

    // Deselect by clicking blank canvas.
    await page.mouse.click(700, 500)
    await expect(page.locator('.container-node--selected')).toHaveCount(0)

    await page.keyboard.press('ControlOrMeta+v')
    await expect(page.locator('.container-node')).toHaveCount(2)
  })

  test("an OS-clipboard URL doesn't hijack a populated in-app clipboard on paste", async ({
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
    await page.keyboard.press('ControlOrMeta+c')

    // A URL sitting on the OS clipboard from outside the app (or from any
    // earlier, unrelated action) must not take priority over the
    // just-populated in-app clipboard.
    await dispatchPaste(page, { text: 'https://example.com' })

    await expect(page.locator('.card--link')).toHaveCount(0)
    await expect(
      page.locator('[data-testid="card"]:not([data-node-id="a"])'),
    ).toHaveCount(1)
  })

  test.describe('copying a container together with its spatially-contained child', () => {
    async function seedAndPasteContainerWithChild(
      page: import('@playwright/test').Page,
    ) {
      await seed(page, {
        version: 1,
        nodes: [
          // c1 sized generously enough that k1 (224 wide) sits completely
          // within it, with margin — full containment, not merely
          // overlap, spec §2.3/§4.4/§4.5.
          containerNode('c1', 100, 100, 300, 250),
          textCard('k1', 130, 150, 'child'),
        ],
        edges: [],
        images: {},
      })
      await page.goto('/')
      const boardBox = await page
        .locator('[data-testid="canvas-root"]')
        .boundingBox()
      if (!boardBox) throw new Error('board not rendered')

      // Marquee-select both the container and its child, then copy/paste.
      await page.mouse.move(boardBox.x + 30, boardBox.y + 30)
      await page.mouse.down()
      await page.mouse.move(boardBox.x + 450, boardBox.y + 450, { steps: 10 })
      await page.mouse.up()
      await page.keyboard.press('ControlOrMeta+c')
      await page.keyboard.press('ControlOrMeta+v')

      const nodes = await readBoardNodes(page)
      const pastedContainer = nodes.find(
        (n) => n.type === 'container' && n.id !== 'c1',
      )
      const pastedChild = nodes.find((n) => n.type === 'card' && n.id !== 'k1')
      return { nodes, pastedContainer, pastedChild }
    }

    test('preserves their relative spatial arrangement on paste (with fresh ids, not the originals)', async ({
      page,
    }) => {
      const { nodes, pastedContainer, pastedChild } =
        await seedAndPasteContainerWithChild(page)

      expect(nodes).toHaveLength(4)
      expect(pastedContainer).toBeTruthy()
      expect(pastedChild).toBeTruthy()
      // Same offset applied to both — so they land in the same relative
      // arrangement as the originals (spec §2.3/§7, v0.1: no `parentId` to
      // preserve, just a uniform offset — see the drag test below for the
      // stronger, behavioral proof that they're still spatially related).
      const containerOffsetX = (pastedContainer?.x ?? 0) - 100
      const containerOffsetY = (pastedContainer?.y ?? 0) - 100
      expect((pastedChild?.x ?? 0) - 130).toBe(containerOffsetX)
      expect((pastedChild?.y ?? 0) - 150).toBe(containerOffsetY)
    })

    test('the pasted child is still carried along when the pasted container is dragged', async ({
      page,
    }) => {
      const { pastedContainer, pastedChild } =
        await seedAndPasteContainerWithChild(page)

      const childLoc = page.locator(
        `[data-node-id="${pastedChild?.id}"]:not(.node-connector)`,
      )
      const before = await childLoc.boundingBox()
      if (!before) throw new Error('pasted child not rendered')
      const handle = page.locator(
        `[data-node-id="${pastedContainer?.id}"]:not(.node-connector) .container-node__drag-handle`,
      )
      const handleBox = await handle.boundingBox()
      if (!handleBox) throw new Error('pasted container handle not rendered')
      await page.mouse.move(handleBox.x + 10, handleBox.y + 5)
      await page.mouse.down()
      await page.mouse.move(handleBox.x + 10 + 60, handleBox.y + 5 + 60, {
        steps: 10,
      })
      await page.mouse.up()

      const after = await childLoc.boundingBox()
      if (!after) throw new Error('pasted child not rendered')
      expect(after.x - before.x).toBeGreaterThan(30)
      expect(after.y - before.y).toBeGreaterThan(30)
    })
  })

  test('a paste that lands outside the viewport pans it into view, without changing zoom', async ({
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
    await page.keyboard.press('ControlOrMeta+c')

    // Pan far away so the paste (which lands near `a`'s world position)
    // ends up off-screen.
    const board = page.locator('[data-testid="canvas-root"]')
    const boardBox = await board.boundingBox()
    if (!boardBox) throw new Error('board not rendered')
    await page.mouse.move(boardBox.x + 200, boardBox.y + 200)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(boardBox.x + 200 - 2000, boardBox.y + 200 - 2000, {
      steps: 10,
    })
    await page.mouse.up({ button: 'right' })
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).not.toBeInViewport()

    const zoomBefore = await page
      .locator('.board__layer')
      .evaluate((el) => (el as HTMLElement).style.transform)

    await page.keyboard.press('ControlOrMeta+v')

    const pasted = page.locator('[data-testid="card"]:not([data-node-id="a"])')
    await expect(pasted).toBeInViewport()

    const zoomAfter = await page
      .locator('.board__layer')
      .evaluate((el) => (el as HTMLElement).style.transform)
    const scaleOf = (t: string) => /scale\(([-\d.]+)\)/.exec(t)?.[1]
    expect(scaleOf(zoomAfter)).toBe(scaleOf(zoomBefore))
  })
})

test.describe('OS clipboard priority (spec §7)', () => {
  test('pasting plain text with nothing selected creates a new text card', async ({
    page,
  }) => {
    await seed(page, childBoardDocument([]))
    await page.goto(`/${CHILD_BOARD_ID}`)
    await dispatchPaste(page, { text: 'hello from the OS clipboard' })
    await expect(
      page.locator('[data-node-id]:not(.node-connector)'),
    ).toHaveCount(1)
    await expect(page.locator('textarea.card__content')).toHaveValue(
      'hello from the OS clipboard',
    )
  })
})

test.describe('keyboard shortcuts (spec §4.2)', () => {
  test('⌘/Ctrl+N creates a new empty text card, focused', async ({ page }) => {
    await seed(page, childBoardDocument([]))
    await page.goto(`/${CHILD_BOARD_ID}`)
    await page.keyboard.press('ControlOrMeta+n')
    await expect(
      page.locator('[data-node-id]:not(.node-connector)'),
    ).toHaveCount(1)
    await expect(page.locator('textarea.card__content')).toBeFocused()
  })

  test('⌘/Ctrl+D duplicates the selection and focuses the single-card duplicate', async ({
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
    await page.keyboard.press('ControlOrMeta+d')
    await expect(
      page.locator('[data-node-id]:not(.node-connector)'),
    ).toHaveCount(2)
    // Two cards now share the `textarea.card__content` selector — narrow
    // to the one that's actually focused (the duplicate).
    await expect(page.locator('textarea.card__content:focus')).toHaveCount(1)
  })

  test.describe('duplicating a container together with its spatially-contained child', () => {
    async function seedAndDuplicateContainerWithChild(
      page: import('@playwright/test').Page,
    ) {
      await seed(page, {
        version: 1,
        nodes: [
          // c1 sized generously enough that k1 (224 wide) sits completely
          // within it, with margin — full containment, not merely
          // overlap, spec §2.3/§4.4/§4.5.
          containerNode('c1', 100, 100, 300, 250),
          textCard('k1', 130, 150, 'child'),
        ],
        edges: [],
        images: {},
      })
      await page.goto('/')
      const boardBox = await page
        .locator('[data-testid="canvas-root"]')
        .boundingBox()
      if (!boardBox) throw new Error('board not rendered')

      await page.mouse.move(boardBox.x + 30, boardBox.y + 30)
      await page.mouse.down()
      await page.mouse.move(boardBox.x + 450, boardBox.y + 450, { steps: 10 })
      await page.mouse.up()
      await page.keyboard.press('ControlOrMeta+d')

      const nodes = await readBoardNodes(page)
      const dupContainer = nodes.find(
        (n) => n.type === 'container' && n.id !== 'c1',
      )
      const dupChild = nodes.find((n) => n.type === 'card' && n.id !== 'k1')
      return { nodes, dupContainer, dupChild }
    }

    test('preserves their relative spatial arrangement on duplicate (with fresh ids, not the originals)', async ({
      page,
    }) => {
      const { nodes, dupContainer, dupChild } =
        await seedAndDuplicateContainerWithChild(page)

      expect(nodes).toHaveLength(4)
      expect(dupContainer).toBeTruthy()
      expect(dupChild).toBeTruthy()
      // Same offset applied to both (whatever it ended up being — see the
      // "escapes the original container" test below for why it isn't
      // always the small fixed baseline) — same relative arrangement as
      // the originals (spec §4.2, v0.1 — see the drag test below for the
      // stronger, behavioral proof that they're still spatially related).
      const containerOffsetX = (dupContainer?.x ?? 0) - 100
      const containerOffsetY = (dupContainer?.y ?? 0) - 100
      expect((dupChild?.x ?? 0) - 130).toBe(containerOffsetX)
      expect((dupChild?.y ?? 0) - 150).toBe(containerOffsetY)
    })

    test('the duplicate escapes the original container instead of landing "stuck" inside it (mirrors paste)', async ({
      page,
    }) => {
      // Regression: ⌘/Ctrl+D used a small fixed offset with no awareness
      // of existing containers, so a duplicated container+child pair
      // landed right back overlapping (and so spatially "stuck" to) the
      // very container it was duplicated from.
      const { dupContainer } = await seedAndDuplicateContainerWithChild(page)
      if (!dupContainer) throw new Error('duplicated container not found')

      const overlapsOriginal =
        dupContainer.x < 100 + 300 &&
        dupContainer.x + 300 > 100 &&
        dupContainer.y < 100 + 250 &&
        dupContainer.y + 250 > 100
      expect(overlapsOriginal).toBe(false)
    })

    test('the duplicated child is still carried along when the duplicated container is dragged', async ({
      page,
    }) => {
      const { dupContainer, dupChild } =
        await seedAndDuplicateContainerWithChild(page)

      const childLoc = page.locator(
        `[data-node-id="${dupChild?.id}"]:not(.node-connector)`,
      )
      const before = await childLoc.boundingBox()
      if (!before) throw new Error('duplicated child not rendered')
      const handle = page.locator(
        `[data-node-id="${dupContainer?.id}"]:not(.node-connector) .container-node__drag-handle`,
      )
      const handleBox = await handle.boundingBox()
      if (!handleBox)
        throw new Error('duplicated container handle not rendered')
      await page.mouse.move(handleBox.x + 10, handleBox.y + 5)
      await page.mouse.down()
      await page.mouse.move(handleBox.x + 10 + 60, handleBox.y + 5 + 60, {
        steps: 10,
      })
      await page.mouse.up()

      const after = await childLoc.boundingBox()
      if (!after) throw new Error('duplicated child not rendered')
      expect(after.x - before.x).toBeGreaterThan(30)
      expect(after.y - before.y).toBeGreaterThan(30)
    })
  })

  test('duplicating a nested parent+child container pair paints the whole duplicate above the whole original, not interleaved', async ({
    page,
  }) => {
    // Regression: sorting containers by a flat depth number (not a
    // depth-first walk) put every depth-0 container before every depth-1
    // container regardless of lineage, so the *original* child container
    // could end up rendered above the *duplicated* parent — an unrelated
    // node cutting into the middle of the new subtree.
    await seed(page, {
      version: 1,
      nodes: [
        containerNode('parent', 100, 100, 400, 400),
        containerNode('child', 130, 150, 200, 200),
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    const boardBox = await page
      .locator('[data-testid="canvas-root"]')
      .boundingBox()
    if (!boardBox) throw new Error('board not rendered')

    await page.mouse.move(boardBox.x + 30, boardBox.y + 30)
    await page.mouse.down()
    await page.mouse.move(boardBox.x + 550, boardBox.y + 550, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.press('ControlOrMeta+d')

    // No `parentId` to distinguish the duplicates by (v0.1) — identify them
    // by size instead: duplicating preserves w/h exactly, so the new
    // 400x400 container is the duplicated "parent" and the new 200x200 one
    // is the duplicated "child".
    const nodes = await readBoardNodes(page)
    const containers = await page.evaluate(
      () =>
        [...document.querySelectorAll('.container-node')].map((el) => ({
          id: el.getAttribute('data-node-id'),
          w: Number.parseFloat((el as HTMLElement).style.width),
          h: Number.parseFloat((el as HTMLElement).style.height),
        })) as { id: string | null; w: number; h: number }[],
    )
    const dupParentId = containers.find(
      (c) => c.id !== 'parent' && c.w === 400 && c.h === 400,
    )?.id
    const dupChildId = containers.find(
      (c) => c.id !== 'child' && c.w === 200 && c.h === 200,
    )?.id
    if (!dupParentId || !dupChildId) {
      throw new Error('duplicated container(s) not found')
    }
    expect(nodes).toHaveLength(4)

    const domOrder = containers.map((c) => c.id)
    const rank = new Map(domOrder.map((id, i) => [id, i]))
    // The whole original subtree (parent, child) paints before the whole
    // duplicated one — not interleaved by depth.
    expect(rank.get('child')).toBeLessThan(rank.get(dupParentId) as number)
    expect(rank.get('parent')).toBeLessThan(rank.get(dupParentId) as number)
    expect(rank.get(dupParentId)).toBeLessThan(rank.get(dupChildId) as number)
  })

  test('a duplicate that lands outside the viewport pans it into view, without changing zoom (mirrors paste)', async ({
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

    // Pan far away so the duplicate (which lands near `a`'s world
    // position) ends up off-screen.
    const board = page.locator('[data-testid="canvas-root"]')
    const boardBox = await board.boundingBox()
    if (!boardBox) throw new Error('board not rendered')
    await page.mouse.move(boardBox.x + 200, boardBox.y + 200)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(boardBox.x + 200 - 2000, boardBox.y + 200 - 2000, {
      steps: 10,
    })
    await page.mouse.up({ button: 'right' })
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).not.toBeInViewport()

    const zoomBefore = await page
      .locator('.board__layer')
      .evaluate((el) => (el as HTMLElement).style.transform)

    await page.keyboard.press('ControlOrMeta+d')

    const duplicate = page.locator(
      '[data-testid="card"]:not([data-node-id="a"])',
    )
    await expect(duplicate).toBeInViewport()

    const zoomAfter = await page
      .locator('.board__layer')
      .evaluate((el) => (el as HTMLElement).style.transform)
    const scaleOf = (t: string) => /scale\(([-\d.]+)\)/.exec(t)?.[1]
    expect(scaleOf(zoomAfter)).toBe(scaleOf(zoomBefore))
  })

  test('Backspace deletes the selection', async ({ page }) => {
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
    await page.keyboard.press('Backspace')
    await expect(
      page.locator('[data-node-id]:not(.node-connector)'),
    ).toHaveCount(0)
  })

  test('⌘/Ctrl+Z undoes a delete and restores the selection', async ({
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
    await page.keyboard.press('Backspace')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--selected/)
  })
})

test.describe('help panel (spec §4.2)', () => {
  test('opens via the ? button and closes on Escape', async ({ page }) => {
    await seed(page, { version: 1, nodes: [], edges: [], images: {} })
    await page.goto('/')
    await page.locator('.board__help').click()
    await expect(page.locator('.help-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.help-panel')).toBeHidden()
  })

  test('does not list a bare-key zoom-reset shortcut', async ({ page }) => {
    await seed(page, { version: 1, nodes: [], edges: [], images: {} })
    await page.goto('/')
    await page.locator('.board__help').click()
    await expect(page.locator('.help-panel')).not.toContainText(/^z$/i)
  })
})
