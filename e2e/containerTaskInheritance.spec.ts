import { expect, type Page, test } from '@playwright/test'
import { CHILD_BOARD_ID, childBoardDocument, seedBoard } from './fixtures/board'

// Container task inheritance (ctx/notes/261019-inherit-container-task.md):
// whatever lands in a *different* task container on drop — or is created
// inside one by double-click — takes on that container's task status.
// Read off the drag-bar status glyph's `data-task-status`
// (components/card/TaskStatusIcon.tsx); a card's DOM never nests inside a
// container's, so the selector only ever matches the node's own glyph.

const STAMP = '2026-01-01T00:00:00.000Z'

function textCard(id: string, x: number, y: number, task = 'none') {
  return {
    id,
    nodeType: 'card',
    cardType: 'text',
    size: 'regular',
    x,
    y,
    w: 224,
    h: 90,
    color: 'gray',
    task,
    content: id,
    createdAt: STAMP,
    updatedAt: STAMP,
  }
}

function containerNode(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  task = 'none',
) {
  return {
    id,
    nodeType: 'container',
    pattern: 'none',
    color: 'gray',
    task,
    x,
    y,
    w,
    h,
    createdAt: STAMP,
    updatedAt: STAMP,
  }
}

async function open(page: Page, nodes: Record<string, unknown>[]) {
  await seedBoard(page, childBoardDocument(nodes), 'kanvy.board')
  await page.goto(`/${CHILD_BOARD_ID}`)
}

function node(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"]:not(.node-connector)`)
}

function statusGlyph(page: Page, id: string) {
  return node(page, id).locator('[data-task-status]')
}

/** Drags from `(x, y)` by `(dx, dy)` in screen px, pausing before release past the 400ms undo-coalesce window. */
async function dragBy(
  page: Page,
  x: number,
  y: number,
  dx: number,
  dy: number,
) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await page.waitForTimeout(600)
  await page.mouse.up()
}

async function dragCardBy(page: Page, id: string, dx: number, dy: number) {
  const box = await node(page, id).locator('.card__bar').boundingBox()
  if (!box) throw new Error(`card ${id} not rendered`)
  await dragBy(page, box.x + 40, box.y + box.height / 2, dx, dy)
}

test.describe('container task inheritance', () => {
  test('a non-task card dropped into a task container becomes a task with its status; one undo reverts both move and status', async ({
    page,
  }) => {
    await open(page, [
      containerNode('box', 100, 100, 400, 300, 'blocked'),
      textCard('c', 700, 200),
    ])
    await expect(statusGlyph(page, 'c')).toHaveCount(0)
    const start = await node(page, 'c').boundingBox()

    await dragCardBy(page, 'c', -560, 0)
    await expect(statusGlyph(page, 'c')).toHaveAttribute(
      'data-task-status',
      'blocked',
    )

    await page.keyboard.press('Control+z')
    await expect(statusGlyph(page, 'c')).toHaveCount(0)
    expect(await node(page, 'c').boundingBox()).toEqual(start)
  })

  test("an existing task's status is overwritten, but repositioning within the same container leaves it alone", async ({
    page,
  }) => {
    await open(page, [
      containerNode('box', 100, 100, 600, 400, 'todo'),
      textCard('c', 900, 200, 'done'),
    ])

    await dragCardBy(page, 'c', -760, 0)
    await expect(statusGlyph(page, 'c')).toHaveAttribute(
      'data-task-status',
      'todo',
    )

    // Change it back by hand, then nudge it within the same container.
    await node(page, 'c').locator('.card__bar').click()
    await page.locator('.task-swatch[title="done"]').click()
    await dragCardBy(page, 'c', 80, 80)
    await expect(statusGlyph(page, 'c')).toHaveAttribute(
      'data-task-status',
      'done',
    )
  })

  test('a multi-selection inherits per item, each from its own new container', async ({
    page,
  }) => {
    await open(page, [
      containerNode('a', 50, 50, 400, 300, 'in_progress'),
      containerNode('b', 550, 50, 400, 300),
      textCard('c1', 100, 500),
      textCard('c2', 600, 500),
    ])
    await node(page, 'c1').locator('.card__bar').click()
    await node(page, 'c2')
      .locator('.card__bar')
      .click({ modifiers: ['Shift'] })

    await dragCardBy(page, 'c1', 0, -350)
    await expect(statusGlyph(page, 'c1')).toHaveAttribute(
      'data-task-status',
      'in_progress',
    )
    // `b` isn't a task — nothing to inherit.
    await expect(statusGlyph(page, 'c2')).toHaveCount(0)
  })

  test('a dragged container and everything it carries inherit the new parent container status', async ({
    page,
  }) => {
    await open(page, [
      containerNode('target', 50, 50, 700, 600, 'blocked'),
      containerNode('moving', 800, 200, 300, 250),
      textCard('inside', 830, 300),
    ])
    const handle = await node(page, 'moving')
      .locator('.container-node__drag-handle')
      .boundingBox()
    if (!handle) throw new Error('handle not rendered')

    await dragBy(page, handle.x + 20, handle.y + handle.height / 2, -650, 0)
    await expect(statusGlyph(page, 'moving')).toHaveAttribute(
      'data-task-status',
      'blocked',
    )
    await expect(statusGlyph(page, 'inside')).toHaveAttribute(
      'data-task-status',
      'blocked',
    )
  })

  test('double-clicking inside a task container creates a card with its status', async ({
    page,
  }) => {
    await open(page, [containerNode('box', 100, 100, 500, 400, 'done')])
    const box = await node(page, 'box').boundingBox()
    if (!box) throw new Error('container not rendered')

    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    const card = page.locator('[data-testid="card"]')
    await expect(card).toHaveCount(1)
    await expect(card.locator('[data-task-status]')).toHaveAttribute(
      'data-task-status',
      'done',
    )
  })
})
