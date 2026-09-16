import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'

// Stage 8 (task layer & view modes) — spec §6. Written against
// components/selection-menu/SelectionMenu.tsx's actual DOM contract
// (`.task-swatch`/`.task-swatch--active`, `.selection-menu`), Card/
// Container's `card--dimmed`/`card--done`/`container-node--selected`
// classes, and the toolbar's view-mode menu
// (`.toolbar__view-menu-item`).
//
// Run and passing (all 4) via the playwright-remote-browser skill. This
// run caught a real bug: every card's `updatedAt` was silently refreshed
// on first render (defeating recency mode almost entirely) — fixed via
// `setNodeHeightAtom` in state/atoms/nodes.ts. See AGENTS.md and
// ctx/notes/260915-phase6-e2e-test-scenario-checklist.md.

function textCard(id: string, x: number, y: number) {
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
    content: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

async function seed(page: import('@playwright/test').Page, board: unknown) {
  await seedBoard(page, board, 'kanvy.board')
}

test.describe('task toggle & status (spec §6.1)', () => {
  test('selection menu adds a task and toggling Task again is idempotent', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('[data-node-id="a"]:not(.node-connector)').click()

    await page.locator('.task-swatch[title="Task"]').click()
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector) .task-status-icon'),
    ).toBeVisible()

    // Cycle status via the menu, then re-click "Task" — status must survive.
    await page.locator('.task-swatch[title="blocked"]').click()
    await page.locator('.task-swatch[title="Task"]').click()
    await expect(page.locator('.task-swatch[title="blocked"]')).toHaveClass(
      /task-swatch--active/,
    )
  })

  test('done styling strikes through and dims the caption', async ({
    page,
  }) => {
    await seed(page, {
      version: 1,
      nodes: [
        {
          ...textCard('a', 100, 100),
          task: { status: 'done' },
        },
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await expect(
      page.locator('[data-node-id="a"]:not(.node-connector)'),
    ).toHaveClass(/card--done/)
  })
})

test.describe('view modes (spec §6.2)', () => {
  test('task view dims non-task nodes', async ({ page }) => {
    await seed(page, {
      version: 1,
      nodes: [
        textCard('plain', 100, 100),
        { ...textCard('task', 400, 100), task: { status: 'todo' } },
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('button[title="Change view mode"]').click()
    await page.locator('.toolbar__view-menu-item', { hasText: 'Task' }).click()

    await expect(
      page.locator('[data-node-id="plain"]:not(.node-connector)'),
    ).toHaveClass(/card--dimmed/)
    await expect(
      page.locator('[data-node-id="task"]:not(.node-connector)'),
    ).not.toHaveClass(/card--dimmed/)
  })

  test('recency view colors borders by updatedAt age, ignoring task status', async ({
    page,
  }) => {
    const now = new Date()
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) // 60 days
    await seed(page, {
      version: 1,
      nodes: [
        { ...textCard('fresh', 100, 100), updatedAt: now.toISOString() },
        { ...textCard('stale', 400, 100), updatedAt: old.toISOString() },
      ],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('button[title="Change view mode"]').click()
    await page
      .locator('.toolbar__view-menu-item', { hasText: 'Recency' })
      .click()

    const freshColor = await page
      .locator('[data-node-id="fresh"]:not(.node-connector)')
      .evaluate((el) => getComputedStyle(el).borderColor)
    const staleColor = await page
      .locator('[data-node-id="stale"]:not(.node-connector)')
      .evaluate((el) => getComputedStyle(el).borderColor)
    expect(freshColor).not.toBe(staleColor)
  })
})
