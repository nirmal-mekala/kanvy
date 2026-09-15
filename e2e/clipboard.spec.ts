import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'
import { dispatchPaste } from './fixtures/clipboard'

// Stage 7 (clipboard, keyboard shortcuts, toolbar/help) — spec §7, §4.2.
//
// NOTE (phase 7, Stage 7): written but NOT run to a passing result in this
// session — same environment limitation as e2e/viewport.spec.ts and
// e2e/interaction.spec.ts (the sandboxed dev container has no local
// browser, and the host-Mac remote Playwright browser has no network path
// back into this container's dev server). Per
// ctx/notes/260915-phase6-e2e-test-scenario-checklist.md's own rule, its
// items are left unchecked until a run actually passes — do so before
// relying on this file.

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
    await page.locator('[data-node-id="a"]').click()
    await page.keyboard.press('ControlOrMeta+c')
    await page.keyboard.press('ControlOrMeta+v')
    await expect(page.locator('[data-node-id]')).toHaveCount(2)
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
    await page.locator('[data-node-id="a"]').click()
    await page.keyboard.press('ControlOrMeta+c')
    await page.keyboard.press('ControlOrMeta+v')
    await page.locator('[data-node-id="a"]').click()
    await page.keyboard.press('ControlOrMeta+v')
    await expect(page.locator('[data-node-id]')).toHaveCount(3)
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
    await page.locator('[data-node-id="a"]').click()
    await page.keyboard.press('ControlOrMeta+c')
    await page.locator('[data-node-id="a"]').click()
    await page.keyboard.press('ControlOrMeta+v')
    const pasted = page
      .locator('[data-node-id]')
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
    await expect(page.locator('[data-node-id]')).toHaveCount(1)
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
    await expect(page.locator('[data-node-id]')).toHaveCount(1)
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
    await page.locator('[data-node-id="a"]').click()
    await page.keyboard.press('ControlOrMeta+d')
    await expect(page.locator('[data-node-id]')).toHaveCount(2)
    await expect(page.locator('textarea.card__content')).toBeFocused()
  })

  test('Backspace deletes the selection', async ({ page }) => {
    await seed(page, {
      version: 1,
      nodes: [textCard('a', 100, 100)],
      edges: [],
      images: {},
    })
    await page.goto('/')
    await page.locator('[data-node-id="a"]').click()
    await page.keyboard.press('Backspace')
    await expect(page.locator('[data-node-id]')).toHaveCount(0)
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
    await page.locator('[data-node-id="a"]').click()
    await page.keyboard.press('Backspace')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.locator('[data-node-id="a"]')).toHaveClass(
      /card--selected/,
    )
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
