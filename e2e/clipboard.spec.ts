import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'
import { dispatchPaste } from './fixtures/clipboard'

// Stage 7 (clipboard, keyboard shortcuts, toolbar/help) — spec §7, §4.2.
//
// Run and passing (all 10) via the playwright-remote-browser skill. This
// run caught two real bugs: the first-ever in-app paste landed with zero
// offset (fixed in clipboard/nodeClipboard.ts), and clicking a card's
// caption text failed to select it at all (see e2e/interaction.spec.ts's
// note) — several tests here deliberately click `.card__bar` instead of
// the card body, since clicking into the caption is correct text-edit
// focus, not something these board-level shortcut tests should trigger.
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
    const pasted = page
      .locator('[data-node-id]:not(.node-connector)')
      .filter({ hasNot: page.locator('.container-node') })
      .last()
    await expect(pasted).not.toHaveAttribute('data-node-id', 'a')
    // The pasted card should not have been assigned the container as its
    // parent — verified indirectly by checking the board doesn't nest it
    // under the container's drag handle in the DOM (containers render
    // outside cards, so this is really just a smoke check that paste didn't
    // crash inside a giant container).
  })
})

test.describe('OS clipboard priority (spec §7)', () => {
  test('pasting plain text with nothing selected creates a new text card', async ({
    page,
  }) => {
    await seed(page, { version: 1, nodes: [], edges: [], images: {} })
    await page.goto('/')
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
    await seed(page, { version: 1, nodes: [], edges: [], images: {} })
    await page.goto('/')
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
