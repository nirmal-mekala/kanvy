import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'
import { startJsonServer } from './fixtures/jsonServer'

// Closes the coverage gaps a 260924 audit flagged: Board/board-card,
// Container, and Edge CRUD had never been exercised against a real
// network backend at any layer (only the generic op→REST-call shape was
// unit-tested for board/edge, and container had zero network coverage of
// any kind); text card recolor (`setColorAtom`) and container pattern
// (`setPatternAtom`) had zero coverage anywhere, any mode. Each test below
// drives one entity kind's full lifecycle — create, update (every
// meaningfully distinct kind of update that entity supports), delete —
// through the real UI, against a real json-server instance, verifying
// each step landed via a direct REST read rather than trusting the UI
// alone (the id-remap fix, ctx/notes/260921-...md's 260923 addendum,
// means every one of these also incidentally re-proves that fix for an
// entity kind beyond the image/text-card cases already covered in
// settingsNetworkMode.spec.ts).
//
// Same port-sharing rationale as settingsNetworkMode.spec.ts: one
// host-forwarded port, reused serially *within this file* — but a
// distinct port *from* settingsNetworkMode.spec.ts's own default (1996),
// with its own env var rather than sharing `KANVY_E2E_JSON_SERVER_PORT`.
// `test.describe.configure({ mode: 'serial' })` only serializes tests
// within one file; Playwright still runs separate spec files concurrently
// across workers, so two files defaulting to the same port collide
// (confirmed: a `--workers=2` full-suite run hit exactly this EADDRINUSE).
test.describe.configure({ mode: 'serial' })

const JSON_SERVER_PORT = Number(
  process.env.KANVY_E2E_JSON_SERVER_PORT_CRUD ?? 1997,
)
const NOW = '2026-01-01T00:00:00.000Z'
const SAMPLE_BOARD_ID = 'b1'

const EMPTY_LOCAL_DOCUMENT = {
  version: 5,
  nodes: [],
  edges: [],
  boards: [
    {
      id: 'root',
      title: 'Home',
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  images: [],
}

/** Root + one child board, reachable via the root's own board-card — every test below navigates into `SAMPLE_BOARD_ID` to do its actual work, same as settingsNetworkMode.spec.ts's round trip test. */
function baseDb(extraNodes: Record<string, unknown>[] = []) {
  return {
    boards: [
      {
        id: 'root',
        title: 'Home',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: SAMPLE_BOARD_ID,
        title: 'Sample board',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    nodes: [
      {
        id: 'n0',
        boardId: 'root',
        type: 'card',
        kind: 'board',
        boardRef: SAMPLE_BOARD_ID,
        x: 88,
        y: 104,
        w: 224,
        h: 90,
        color: 'gray',
        status: 'active',
        index: 0,
        content: '',
        createdAt: NOW,
        updatedAt: NOW,
      },
      ...extraNodes,
    ],
    edges: [],
    images: [],
  }
}

function textCard(id: string, x: number, content: string) {
  return {
    id,
    boardId: SAMPLE_BOARD_ID,
    type: 'card',
    kind: 'text',
    size: 'regular',
    x,
    y: 100,
    w: 224,
    h: 90,
    color: 'gray',
    status: 'active',
    index: 0,
    content,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

async function connectNetwork(page: Page, baseUrl: string): Promise<void> {
  await page.getByTitle('Settings').click()
  await page.getByRole('button', { name: 'Network' }).click()
  await page.getByPlaceholder('http://localhost:1996').fill(baseUrl)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByPlaceholder('http://localhost:1996')).toHaveCount(0, {
    timeout: 10_000,
  })
}

async function getCollection(
  page: Page,
  baseUrl: string,
  name: string,
): Promise<Record<string, unknown>[]> {
  const res = await page.request.get(`${baseUrl}/${name}`)
  return res.json()
}

async function navigateIntoSampleBoard(page: Page): Promise<void> {
  await page.locator('.board-name__activate').click()
  await expect(page.locator('[data-testid="canvas-root"]')).toBeVisible()
}

/**
 * The one node this test itself created on `SAMPLE_BOARD_ID` — `/nodes`
 * is a flat, unscoped collection shared with root's own seeded board-card
 * (`n0`), so `nodes[0]` is *not* reliably "the card this test just
 * created" (it's whichever happened to be inserted first — n0, in every
 * test below). Every text-card/container test only ever has exactly one
 * node on `SAMPLE_BOARD_ID` at a time, so filtering by `boardId` finds it
 * unambiguously regardless of array order.
 */
async function getSampleBoardNode(
  page: Page,
  baseUrl: string,
): Promise<Record<string, unknown> | undefined> {
  const nodes = await getCollection(page, baseUrl, 'nodes')
  return nodes.find((node) => node.boardId === SAMPLE_BOARD_ID)
}

test.describe('board CRUD over the network', () => {
  test('create, rename, and delete a board via the UI round-trips through real REST calls', async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const server = await startJsonServer(baseDb(), JSON_SERVER_PORT)
    try {
      const baseUrl = `http://localhost:${server.port}`
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await connectNetwork(page, baseUrl)

      // CREATE — double-click on root's own canvas mints a fresh BoardMeta
      // + a board-card referencing it, in one gesture (design doc §3).
      const boardsBefore = await getCollection(page, baseUrl, 'boards')
      await page
        .locator('[data-testid="canvas-root"]')
        .dblclick({ position: { x: 500, y: 400 } })
      await expect(page.locator('.card--board')).toHaveCount(2, {
        timeout: 10_000,
      })
      await expect
        .poll(
          async () => (await getCollection(page, baseUrl, 'boards')).length,
          { timeout: 10_000 },
        )
        .toBe(boardsBefore.length + 1)
      const newBoardCard = page.locator('.card--board').last()

      // UPDATE — on-canvas rename (BoardNameEditor.tsx, shared with the
      // breadcrumb's own rename control).
      await newBoardCard.hover()
      await newBoardCard.locator('.board-name__edit-btn').click()
      await newBoardCard
        .locator('.board-name__input')
        .fill('Renamed over the network')
      await newBoardCard.locator('.board-name__edit-btn--confirm').click()
      await expect
        .poll(
          async () => {
            const boards = await getCollection(page, baseUrl, 'boards')
            return boards.some((b) => b.title === 'Renamed over the network')
          },
          { timeout: 10_000 },
        )
        .toBe(true)

      // DELETE — a board-card delete is gated behind a confirm modal
      // (design doc §7's board-node cascade: tombstones both the node and
      // the `BoardMeta` it references).
      await newBoardCard.locator('.card__bar').click()
      await page.keyboard.press('Backspace')
      await expect(page.locator('.confirm-modal__btn--confirm')).toBeVisible()
      await page.locator('.confirm-modal__btn--confirm').click()
      await expect(page.locator('.toast')).toHaveCount(0)
      await expect
        .poll(
          async () => {
            const boards = await getCollection(page, baseUrl, 'boards')
            const renamed = boards.find(
              (b) => b.title === 'Renamed over the network',
            )
            return renamed?.status
          },
          { timeout: 10_000 },
        )
        .toBe('trashed')
    } finally {
      await server.stop()
    }
  })
})

test.describe('text card CRUD over the network', () => {
  test('create, edit content, recolor, and delete a text card via the UI round-trips through real REST calls', async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const server = await startJsonServer(baseDb(), JSON_SERVER_PORT)
    try {
      const baseUrl = `http://localhost:${server.port}`
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await connectNetwork(page, baseUrl)
      await navigateIntoSampleBoard(page)

      // CREATE
      await page
        .locator('[data-testid="canvas-root"]')
        .dblclick({ position: { x: 500, y: 400 } })
      const card = page.locator('[data-testid="card"]')
      await expect(card).toHaveCount(1, { timeout: 10_000 })
      await expect
        .poll(
          async () => (await getSampleBoardNode(page, baseUrl)) !== undefined,
          {
            timeout: 10_000,
          },
        )
        .toBe(true)

      // UPDATE — content edit (`.fill()` alone dispatches the `input`
      // event Card.tsx's onChange commits from — no blur needed, and
      // `.blur()` here hangs, per the id-remap regression test's own note).
      await card.locator('.card__content').fill('Edited over the network')
      await expect
        .poll(async () => (await getSampleBoardNode(page, baseUrl))?.content, {
          timeout: 10_000,
        })
        .toBe('Edited over the network')

      // UPDATE — recolor (`setColorAtom` — previously zero test coverage
      // anywhere, any mode).
      await card.locator('.card__bar').click()
      await page.locator('.swatch[title="coral"]').click()
      await expect
        .poll(async () => (await getSampleBoardNode(page, baseUrl))?.color, {
          timeout: 10_000,
        })
        .toBe('coral')

      // DELETE
      await card.locator('.card__bar').click()
      await page.keyboard.press('Backspace')
      await expect(page.locator('.toast')).toHaveCount(0)
      await expect
        .poll(async () => (await getSampleBoardNode(page, baseUrl))?.status, {
          timeout: 10_000,
        })
        .toBe('trashed')
    } finally {
      await server.stop()
    }
  })
})

test.describe('container CRUD over the network', () => {
  test('create, resize, change pattern, and delete a container via the UI round-trips through real REST calls', async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const server = await startJsonServer(baseDb(), JSON_SERVER_PORT)
    try {
      const baseUrl = `http://localhost:${server.port}`
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await connectNetwork(page, baseUrl)
      await navigateIntoSampleBoard(page)

      // CREATE — ctrl+click-drag on blank canvas (spec §4.5).
      const board = page.locator('[data-testid="canvas-root"]')
      const boardBox = await board.boundingBox()
      if (!boardBox) throw new Error('board not rendered')
      await page.keyboard.down('Control')
      await page.mouse.move(boardBox.x + 60, boardBox.y + 60)
      await page.mouse.down()
      await page.mouse.move(boardBox.x + 300, boardBox.y + 300, { steps: 10 })
      await page.mouse.up()
      await page.keyboard.up('Control')
      const container = page.locator('.container-node')
      await expect(container).toHaveCount(1, { timeout: 10_000 })
      await expect
        .poll(
          async () => (await getSampleBoardNode(page, baseUrl)) !== undefined,
          {
            timeout: 10_000,
          },
        )
        .toBe(true)
      const created = (await getSampleBoardNode(page, baseUrl)) as { w: number }

      // UPDATE — resize via its 8-way handle.
      const handleBox = await container
        .locator('.resize-handle--se')
        .boundingBox()
      if (!handleBox) throw new Error('resize handle not rendered')
      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
      )
      await page.mouse.down()
      await page.mouse.move(handleBox.x + 80, handleBox.y + 80, { steps: 5 })
      await page.mouse.up()
      await expect
        .poll(async () => (await getSampleBoardNode(page, baseUrl))?.w, {
          timeout: 10_000,
        })
        .not.toBe(created.w)

      // UPDATE — pattern (`setPatternAtom` — previously zero test coverage
      // anywhere, any mode).
      await container.click()
      await page.locator('.pattern-swatch[title="wiggle"]').click()
      await expect
        .poll(async () => (await getSampleBoardNode(page, baseUrl))?.pattern, {
          timeout: 10_000,
        })
        .toBe('wiggle')

      // DELETE — a plain click on the container body (not its drag
      // handle) selects it, same as local mode (interaction.spec.ts).
      await container.click()
      await page.keyboard.press('Backspace')
      await expect(page.locator('.toast')).toHaveCount(0)
      await expect
        .poll(async () => (await getSampleBoardNode(page, baseUrl))?.status, {
          timeout: 10_000,
        })
        .toBe('trashed')
    } finally {
      await server.stop()
    }
  })
})

test.describe('edge CRUD over the network', () => {
  test('create, toggle direction, and delete an edge via the UI round-trips through real REST calls', async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const server = await startJsonServer(
      baseDb([
        textCard('node-a', 80, 'Card A'),
        textCard('node-b', 400, 'Card B'),
      ]),
      JSON_SERVER_PORT,
    )
    try {
      const baseUrl = `http://localhost:${server.port}`
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await connectNetwork(page, baseUrl)
      await navigateIntoSampleBoard(page)
      await expect(page.locator('[data-node-id="node-a"]')).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.locator('[data-node-id="node-b"]')).toBeVisible()

      // CREATE — drag from node-a's right connector to node-b (cards.spec.ts's
      // own recipe).
      const nodeA = page.locator('[data-node-id="node-a"]:not(.node-connector)')
      await nodeA.hover()
      const connectorBox = await page
        .locator(
          '[data-node-id="node-a"]:not(.node-connector) .node-connector--right',
        )
        .boundingBox()
      const nodeBBox = await page
        .locator('[data-node-id="node-b"]:not(.node-connector)')
        .boundingBox()
      if (!connectorBox || !nodeBBox) throw new Error('nodes not rendered')
      await page.mouse.move(
        connectorBox.x + connectorBox.width / 2,
        connectorBox.y + connectorBox.height / 2,
      )
      await page.mouse.down()
      await page.mouse.move(
        nodeBBox.x + nodeBBox.width / 2,
        nodeBBox.y + nodeBBox.height / 2,
        { steps: 10 },
      )
      await page.mouse.up()
      await expect(page.locator('[data-edge-id]')).toHaveCount(1, {
        timeout: 10_000,
      })
      await expect
        .poll(
          async () => (await getCollection(page, baseUrl, 'edges')).length,
          {
            timeout: 10_000,
          },
        )
        .toBe(1)
      const edgeId = await page
        .locator('[data-edge-id]')
        .getAttribute('data-edge-id')

      // UPDATE — direction toggle. `.edge__hit`'s stroke hit-area needs a
      // direct pointerdown dispatch — a bbox-center `.click()` misses the
      // curved bezier path (cards.spec.ts's own note).
      await page
        .locator(`[data-edge-id="${edgeId}"] .edge__hit`)
        .dispatchEvent('pointerdown', { button: 0 })
      await page
        .locator('.edge-direction-control__btn[title="Forward"]')
        .click()
      await expect
        .poll(
          async () =>
            (await getCollection(page, baseUrl, 'edges'))[0]?.direction,
          { timeout: 10_000 },
        )
        .toBe('forward')

      // DELETE
      await page
        .locator(`[data-edge-id="${edgeId}"] .edge__hit`)
        .dispatchEvent('pointerdown', { button: 0 })
      await page.keyboard.press('Backspace')
      await expect(page.locator('.toast')).toHaveCount(0)
      await expect
        .poll(
          async () => (await getCollection(page, baseUrl, 'edges'))[0]?.status,
          { timeout: 10_000 },
        )
        .toBe('trashed')
    } finally {
      await server.stop()
    }
  })
})

test.describe('id reconciliation regression (ctx/notes/260925-network-id-reconciliation.md)', () => {
  test('a node created inside a just-created board is persisted under the real, server-assigned boardId — not the locally-minted one', async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const server = await startJsonServer(baseDb(), JSON_SERVER_PORT)
    try {
      const baseUrl = `http://localhost:${server.port}`
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await connectNetwork(page, baseUrl)

      // CREATE the board — same gesture as the "board CRUD" describe
      // above. POST /boards never sends an id; json-server assigns its
      // own (the reported bug's actual root cause: the client's own
      // locally-minted id and the server's real id differ from here on).
      const boardsBefore = await getCollection(page, baseUrl, 'boards')
      await page
        .locator('[data-testid="canvas-root"]')
        .dblclick({ position: { x: 500, y: 400 } })
      await expect(page.locator('.card--board')).toHaveCount(2, {
        timeout: 10_000,
      })
      await expect
        .poll(
          async () => (await getCollection(page, baseUrl, 'boards')).length,
          { timeout: 10_000 },
        )
        .toBe(boardsBefore.length + 1)
      const newBoardCard = page.locator('.card--board').last()

      // NAVIGATE into the just-created board.
      await newBoardCard.locator('.board-name__activate').click()
      await expect(page.locator('[data-testid="canvas-root"]')).toBeVisible()

      // The real, server-assigned board id — reconciled into the route
      // (state/networkReconcile.ts) as soon as `POST /boards` resolved.
      const boardsAfterCreate = await getCollection(page, baseUrl, 'boards')
      const realBoardId = boardsAfterCreate.find(
        (b) => !boardsBefore.some((existing) => existing.id === b.id),
      )?.id as string
      expect(page.url()).toContain(realBoardId)

      // CREATE a node *inside* the new board — separate gesture, well
      // after the board's own create has resolved (same as the original
      // repro: navigate in, then create).
      await page
        .locator('[data-testid="canvas-root"]')
        .dblclick({ position: { x: 300, y: 300 } })
      await expect(page.locator('[data-testid="card"]')).toHaveCount(1, {
        timeout: 10_000,
      })

      // The node must be persisted under the *real* board id — reading it
      // back the same way a page reload's `GET /nodes?boardId=<real-id>`
      // would (state/networkBoardLoader.ts's `ensureBoardLoaded`) is
      // exactly what the reported bug broke: the node used to be stored
      // under the stale local id, which no `GET` for a real board id
      // could ever find.
      await expect
        .poll(
          async () => {
            const nodes = await getCollection(page, baseUrl, 'nodes')
            return nodes.some((n) => n.boardId === realBoardId)
          },
          { timeout: 10_000 },
        )
        .toBe(true)
    } finally {
      await server.stop()
    }
  })
})
