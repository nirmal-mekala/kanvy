import { type Browser, expect, type Page, test } from '@playwright/test'
import { diffScreenshots } from './diff'
import {
  buildOurBoard,
  buildPrototypeBoard,
  PLACEHOLDER_IMAGE_DATA_URI,
  type Scene,
  type SeedOptions,
  seedScene,
} from './scenes'

// Visual-regression scenarios for
// ctx/notes/260915-phase6-e2e-test-scenario-checklist.md's
// "Visual-regression tier" section (phase 7 Stage 10). Each scenario
// seeds equivalent content on the new app and the live prototype
// (paired dev servers, playwright.visual.config.ts) and diffs a
// screenshot of each via pixelmatch (e2e/visual/diff.ts).
//
// STATUS: run and passing (21/21) via the playwright-remote-browser skill
// — both dev servers on two of this container's published ports, per
// AGENTS.md. This tier's first-ever real run found and fixed three bugs:
// a container pattern's tint color was theme-varying instead of the fixed
// neutral it's supposed to be (Container.tsx/SelectionMenu.tsx), this
// harness's own `scenes.ts` mismapped three pattern keys' casing against
// the prototype's `PATTERNS` object (silently rendering blank patterns on
// the prototype side), and the help-panel scenario assumed exact-pixel
// screenshot dimensions despite the two apps' intentionally different
// shortcut-list wording changing its wrapped height by a few px. See
// ctx/notes/260915-phase6-e2e-test-scenario-checklist.md's
// "Visual-regression tier" section for the full writeup.

const NEW_APP_URL = `http://localhost:${process.env.KANVY_VISUAL_NEW_APP_PORT ?? '5173'}`
const PROTOTYPE_URL = `http://localhost:${process.env.KANVY_VISUAL_PROTOTYPE_PORT ?? '5174'}`
const VIEWPORT = { width: 900, height: 700 }

async function waitForImagesToDecode(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? Promise.resolve() : img.decode().catch(() => {}),
      ),
    ),
  )
  // Let React commit the re-render that `onLoad`/`decode()` triggers
  // (e.g. `CardMedia`'s small-image sizing class) before we screenshot.
  await page.evaluate(
    () =>
      new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))),
  )
}

async function captureBoardPair(
  browser: Browser,
  scene: Scene,
  options: SeedOptions = {},
): Promise<{ actual: Buffer; expected: Buffer }> {
  const newAppContext = await browser.newContext({ viewport: VIEWPORT })
  const prototypeContext = await browser.newContext({ viewport: VIEWPORT })
  try {
    const newAppPage = await newAppContext.newPage()
    const prototypePage = await prototypeContext.newPage()

    await seedScene(newAppPage, buildOurBoard(scene), options)
    await seedScene(prototypePage, buildPrototypeBoard(scene), options)

    await newAppPage.goto(NEW_APP_URL)
    await prototypePage.goto(PROTOTYPE_URL)

    // `.board__layer` is the shared class name for the pannable/zoomable
    // node layer in both apps (confirmed in both Canvas.tsx and Board.jsx)
    // — screenshotting it (not the full page) excludes toolbar/chrome
    // differences unrelated to what these scenarios are actually testing.
    const newAppBoard = newAppPage.locator('.board__layer')
    const prototypeBoard = prototypePage.locator('.board__layer')
    await newAppBoard.waitFor()
    await prototypeBoard.waitFor()

    // Card images (e.g. `CardMedia.tsx`) resize themselves on `onLoad`, one
    // React render after paint — without waiting for decode, a screenshot
    // can land mid-flight and diff against the settled prototype/expected
    // state (found via a CI-only flake on the image-card scenarios).
    await Promise.all([
      waitForImagesToDecode(newAppPage),
      waitForImagesToDecode(prototypePage),
    ])

    const [actual, expected] = await Promise.all([
      newAppBoard.screenshot(),
      prototypeBoard.screenshot(),
    ])
    return { actual, expected }
  } finally {
    await newAppContext.close()
    await prototypeContext.close()
  }
}

function centeredScene(nodes: Scene['nodes'], images?: Scene['images']): Scene {
  return images ? { nodes, images } : { nodes }
}

test.describe('default seed board', () => {
  const scene = centeredScene([
    {
      type: 'card',
      id: 'seed-1',
      kind: 'text',
      size: 'regular',
      x: 88,
      y: 104,
      w: 224,
      h: 90,
      color: 'amber',
      content: 'Welcome to Kanvy\n\nDouble-click the canvas to add a note.',
    },
  ])

  test('standard view, light theme', async ({ browser }) => {
    const { actual, expected } = await captureBoardPair(browser, scene, {
      theme: 'light',
      viewMode: 'standard',
    })
    const result = diffScreenshots(actual, expected, {
      maxDiffPixelRatio: 0.01,
    })
    expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
  })

  test('standard view, dark theme', async ({ browser }) => {
    const { actual, expected } = await captureBoardPair(browser, scene, {
      theme: 'dark',
      viewMode: 'standard',
    })
    const result = diffScreenshots(actual, expected, {
      maxDiffPixelRatio: 0.01,
    })
    expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
  })
})

test.describe('each card kind in isolation', () => {
  const cases: Array<{ name: string; card: Scene['nodes'][number] }> = [
    {
      name: 'text regular',
      card: {
        type: 'card',
        id: 'k-text',
        kind: 'text',
        size: 'regular',
        x: 88,
        y: 104,
        w: 224,
        h: 90,
        color: 'sky',
        content: 'A regular text card.',
      },
    },
    {
      name: 'text big',
      card: {
        type: 'card',
        id: 'k-big',
        kind: 'text',
        size: 'big',
        x: 88,
        y: 104,
        w: 256,
        h: 128,
        color: 'violet',
        content: 'A big, user-resizable text card with more room to write.',
      },
    },
    {
      name: 'image',
      card: {
        type: 'card',
        id: 'k-image',
        kind: 'text', // imageId below re-derives kind to 'image' in buildOurBoard
        x: 88,
        y: 104,
        w: 224,
        h: 160,
        color: 'teal',
        imageId: 'img-1',
        content: '',
      },
    },
    {
      name: 'link',
      card: {
        type: 'card',
        id: 'k-link',
        kind: 'link',
        x: 88,
        y: 104,
        w: 224,
        h: 140,
        color: 'pink',
        content: '',
        link: {
          url: 'https://example.com',
          title: 'Example Domain',
          status: 'ready',
        },
      },
    },
  ]

  for (const { name, card } of cases) {
    test(name, async ({ browser }) => {
      const scene = centeredScene([card], {
        'img-1': PLACEHOLDER_IMAGE_DATA_URI,
      })
      const { actual, expected } = await captureBoardPair(browser, scene)
      const result = diffScreenshots(actual, expected, {
        maxDiffPixelRatio: 0.02,
      })
      expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
    })
  }
})

test.describe('each container pattern', () => {
  const patterns = [
    'none',
    'diagonal',
    'graph-paper',
    'wiggle',
    'plus',
    'jupiter',
    'topography',
    'yyy',
    'corkscrew',
  ] as const

  for (const pattern of patterns) {
    test(pattern, async ({ browser }) => {
      const scene = centeredScene([
        {
          type: 'container',
          id: `container-${pattern}`,
          x: 80,
          y: 96,
          w: 256,
          h: 192,
          color: 'gray',
          pattern,
        },
      ])
      const { actual, expected } = await captureBoardPair(browser, scene)
      const result = diffScreenshots(actual, expected, {
        maxDiffPixelRatio: 0.02,
      })
      expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
    })
  }
})

test('task view with a mix of statuses', async ({ browser }) => {
  const statuses = ['todo', 'blocked', 'in_progress', 'done'] as const
  const scene = centeredScene(
    statuses.map((status, i) => ({
      type: 'card' as const,
      id: `task-${status}`,
      kind: 'text' as const,
      size: 'regular' as const,
      x: 88,
      y: 96 + i * 112,
      w: 224,
      h: 90,
      color: 'sky' as const,
      content: `A ${status} task.`,
      task: status,
    })),
  )
  const { actual, expected } = await captureBoardPair(browser, scene, {
    viewMode: 'task',
  })
  const result = diffScreenshots(actual, expected, { maxDiffPixelRatio: 0.02 })
  expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
})

test('recency view across all 4 thresholds', async ({ browser }) => {
  const now = Date.now()
  const hoursAgo = (h: number) =>
    new Date(now - h * 60 * 60 * 1000).toISOString()
  const thresholds = [
    { label: 'lime (<=1 day)', hours: 1 },
    { label: 'amber (<=1 week)', hours: 3 * 24 },
    { label: 'orange (<=1 month)', hours: 14 * 24 },
    { label: 'coral (>1 month)', hours: 60 * 24 },
  ]
  const scene = centeredScene(
    thresholds.map((t, i) => ({
      type: 'card' as const,
      id: `recency-${i}`,
      kind: 'text' as const,
      size: 'regular' as const,
      x: 88,
      y: 96 + i * 112,
      w: 224,
      h: 90,
      color: 'sky' as const,
      content: t.label,
      updatedAt: hoursAgo(t.hours),
    })),
  )
  const { actual, expected } = await captureBoardPair(browser, scene, {
    viewMode: 'recency',
  })
  const result = diffScreenshots(actual, expected, { maxDiffPixelRatio: 0.02 })
  expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
})

test('done styling (struck-through text, tinted image overlay)', async ({
  browser,
}) => {
  const scene = centeredScene(
    [
      {
        type: 'card' as const,
        id: 'done-text',
        kind: 'text' as const,
        size: 'regular' as const,
        x: 88,
        y: 96,
        w: 224,
        h: 90,
        color: 'lime' as const,
        content: 'A finished task, struck through and dimmed.',
        task: 'done' as const,
      },
      {
        type: 'card' as const,
        id: 'done-image',
        kind: 'text' as const,
        x: 88,
        y: 220,
        w: 224,
        h: 160,
        color: 'lime' as const,
        content: '',
        imageId: 'img-done',
        task: 'done' as const,
      },
    ],
    { 'img-done': PLACEHOLDER_IMAGE_DATA_URI },
  )
  const { actual, expected } = await captureBoardPair(browser, scene)
  const result = diffScreenshots(actual, expected, { maxDiffPixelRatio: 0.03 })
  expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
})

test('help panel open', async ({ browser }) => {
  const newAppContext = await browser.newContext({ viewport: VIEWPORT })
  const prototypeContext = await browser.newContext({ viewport: VIEWPORT })
  try {
    const newAppPage = await newAppContext.newPage()
    const prototypePage = await prototypeContext.newPage()
    await newAppPage.goto(NEW_APP_URL)
    await prototypePage.goto(PROTOTYPE_URL)

    await newAppPage.locator('button[title="Keyboard shortcuts"]').click()
    await prototypePage.locator('button[title="Keyboard shortcuts"]').click()

    const newAppPanel = newAppPage.locator('.help-panel')
    const prototypePanel = prototypePage.locator('.help-panel')
    await newAppPanel.waitFor()
    await prototypePanel.waitFor()

    // The shortcut list's *wording* is intentionally different between the
    // two apps (v0's approved "card"/"container" terminology rename vs.
    // the prototype's original "note"/"grouping box" — see AGENTS.md), so
    // the table's wrapped row heights can differ by a few px even though
    // the dialog chrome itself (border, title, row styling) is identical.
    // Clip both screenshots to their shared height instead of asserting
    // exact pixel dimensions.
    const [newBox, protoBox] = await Promise.all([
      newAppPanel.boundingBox(),
      prototypePanel.boundingBox(),
    ])
    if (!newBox || !protoBox) throw new Error('help panel not rendered')
    const sharedHeight = Math.floor(Math.min(newBox.height, protoBox.height))

    // `clip` is page-viewport-relative, not element-relative — only
    // `page.screenshot()` supports it (`Locator.screenshot()` doesn't).
    const [actual, expected] = await Promise.all([
      newAppPage.screenshot({
        clip: {
          x: newBox.x,
          y: newBox.y,
          width: newBox.width,
          height: sharedHeight,
        },
      }),
      prototypePage.screenshot({
        clip: {
          x: protoBox.x,
          y: protoBox.y,
          width: protoBox.width,
          height: sharedHeight,
        },
      }),
    ])
    const result = diffScreenshots(actual, expected, {
      maxDiffPixelRatio: 0.05,
    })
    expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
  } finally {
    await newAppContext.close()
    await prototypeContext.close()
  }
})

test('selection menu anchored to a mixed selection', async ({ browser }) => {
  const scene = centeredScene([
    {
      type: 'card',
      id: 'sel-card',
      kind: 'text',
      size: 'regular',
      x: 88,
      y: 104,
      w: 224,
      h: 90,
      color: 'amber',
      content: 'Selected card.',
    },
    {
      type: 'container',
      id: 'sel-container',
      x: 400,
      y: 104,
      w: 224,
      h: 160,
      color: 'gray',
      pattern: 'none',
    },
  ])

  const newAppContext = await browser.newContext({ viewport: VIEWPORT })
  const prototypeContext = await browser.newContext({ viewport: VIEWPORT })
  try {
    const newAppPage = await newAppContext.newPage()
    const prototypePage = await prototypeContext.newPage()

    await seedScene(newAppPage, buildOurBoard(scene))
    await seedScene(prototypePage, buildPrototypeBoard(scene))
    await newAppPage.goto(NEW_APP_URL)
    await prototypePage.goto(PROTOTYPE_URL)

    // Click the card, then shift-click the container, to build a mixed
    // selection (spec §4.3) and open the one selection menu it anchors.
    await newAppPage.locator('[data-node-id="sel-card"]').click()
    await newAppPage
      .locator('[data-node-id="sel-container"] .container-node__drag-handle')
      .click({ modifiers: ['Shift'] })
    await prototypePage.locator('[data-node-id="sel-card"]').click()
    await prototypePage
      .locator('[data-node-id="sel-container"] .group__drag-handle')
      .click({ modifiers: ['Shift'] })

    const newAppMenu = newAppPage.locator('.selection-menu')
    const prototypeMenu = prototypePage.locator('.selection-menu')
    await newAppMenu.waitFor()
    await prototypeMenu.waitFor()

    // The text-size section's *option count* is intentionally different
    // between the two apps (this app added h2/h3 alongside the renamed
    // h1/"big" — the prototype only ever had the one regular/big toggle),
    // so the menu wraps to an extra row and is taller here even though the
    // shared chrome (swatch grid styling, dividers) is identical. Same fix
    // as the help-panel scenario above: clip both screenshots to their
    // shared height instead of asserting exact pixel dimensions.
    const [newBox, protoBox] = await Promise.all([
      newAppMenu.boundingBox(),
      prototypeMenu.boundingBox(),
    ])
    if (!newBox || !protoBox) throw new Error('selection menu not rendered')
    const sharedHeight = Math.floor(Math.min(newBox.height, protoBox.height))

    const [actual, expected] = await Promise.all([
      newAppPage.screenshot({
        clip: {
          x: newBox.x,
          y: newBox.y,
          width: newBox.width,
          height: sharedHeight,
        },
      }),
      prototypePage.screenshot({
        clip: {
          x: protoBox.x,
          y: protoBox.y,
          width: protoBox.width,
          height: sharedHeight,
        },
      }),
    ])
    const result = diffScreenshots(actual, expected, {
      maxDiffPixelRatio: 0.08,
    })
    expect(result.passed, `diff ratio ${result.diffPixelRatio}`).toBe(true)
  } finally {
    await newAppContext.close()
    await prototypeContext.close()
  }
})
