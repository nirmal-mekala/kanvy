import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'
import { dispatchPaste } from './fixtures/clipboard'
import { startJsonServer } from './fixtures/jsonServer'
import { makeImageDataUri, makeNoisyImageDataUri } from './fixtures/testImage'

// Every network-mode test below binds a real json-server to a fixed,
// host-forwarded port (so a remote browser, per the playwright-remote-
// browser skill, can reach it) — there's no ephemeral-port option here the
// way there would be for a purely container-local server. Serialized
// (rather than this file's tests running in parallel across workers, this
// config's global `fullyParallel: true` default) so two of them never
// race for the same port when the whole suite runs together.
test.describe.configure({ mode: 'serial' })

// A minimal, already-non-fresh local board — seeded into localStorage
// before every `page.goto('/')` below so the app doesn't take the
// brand-new-user onboarding redirect (freshBoardIdAtom, state/history/
// boardHistoryAtom.ts) away from `/` before these specs ever get a
// chance to open the settings modal. Every other e2e spec that
// navigates to `/` follows this same seed-first convention.
const EMPTY_LOCAL_DOCUMENT = {
  version: 5,
  nodes: [],
  edges: [],
  boards: [
    {
      id: 'root',
      title: 'Home',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  images: [],
}

// Network mode / backend integration (ctx/notes/260923-network-mode-
// backend-integration-design.md, ctx/prompt/260923-network-mode-backend-
// integration.md §8): settings modal flow (toggle, connection-test
// failure, connection-test success + apply) and a basic network-mode
// board load/edit round trip against a real json-server instance.
//
// json-server must bind a port the *browser* (possibly remote, per the
// playwright-remote-browser skill) can reach — this container's actually-
// forwarded range is 1993-1997 (KANVY_E2E_PORT itself typically claims
// 1993 for the Vite dev server), not an arbitrary port. Every test below
// reuses this same single port rather than offsetting per-test — safe only
// because `test.describe.configure({ mode: 'serial' })` above guarantees
// no two of this file's `startJsonServer` calls are ever live at once.
const JSON_SERVER_PORT = Number(process.env.KANVY_E2E_JSON_SERVER_PORT ?? 1996)

const NOW = '2026-01-01T00:00:00.000Z'

function sampleDb() {
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
        id: 'b1',
        title: 'Network board',
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
        boardRef: 'b1',
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
      {
        id: 'n1',
        boardId: 'b1',
        type: 'card',
        kind: 'text',
        size: 'regular',
        x: 80,
        y: 100,
        w: 224,
        h: 90,
        color: 'amber',
        status: 'active',
        index: 0,
        content: 'From the network',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    edges: [],
    images: [],
  }
}

test.describe('settings modal (network mode design doc §2)', () => {
  test('toggling to Network reveals base URL/token fields; toggling back to Local hides them', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await page.getByTitle('Settings').click()
    await expect(page.getByPlaceholder('http://localhost:1996')).toHaveCount(0)

    await page.getByRole('button', { name: 'Network' }).click()
    await expect(page.getByPlaceholder('http://localhost:1996')).toBeVisible()

    await page.getByRole('button', { name: 'Local' }).click()
    await expect(page.getByPlaceholder('http://localhost:1996')).toHaveCount(0)
  })

  test('Confirm with an unreachable base URL keeps the modal open with an inline error', async ({
    page,
  }) => {
    await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
    await page.goto('/')
    await page.getByTitle('Settings').click()
    await page.getByRole('button', { name: 'Network' }).click()
    await page
      .getByPlaceholder('http://localhost:1996')
      .fill('http://localhost:1')
    await page.getByRole('button', { name: 'Confirm' }).click()

    await expect(page.getByText(/Could not connect/)).toBeVisible()
    // Still open — the toggle/fields are still there.
    await expect(page.getByPlaceholder('http://localhost:1996')).toBeVisible()
  })

  test('Confirm against a reachable backend applies network mode and hides Upload', async ({
    page,
  }) => {
    const server = await startJsonServer(sampleDb(), JSON_SERVER_PORT)
    try {
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await expect(
        page.getByTitle('Import a board from a JSON file'),
      ).toBeVisible()

      await page.getByTitle('Settings').click()
      await page.getByRole('button', { name: 'Network' }).click()
      await page
        .getByPlaceholder('http://localhost:1996')
        .fill(`http://localhost:${server.port}`)
      await page.getByRole('button', { name: 'Confirm' }).click()

      // Modal closes once the connection test + home-board load succeed.
      await expect(page.getByPlaceholder('http://localhost:1996')).toHaveCount(
        0,
        { timeout: 10_000 },
      )
      // Network mode hides Upload (design doc §3).
      await expect(
        page.getByTitle('Import a board from a JSON file'),
      ).toHaveCount(0)
    } finally {
      await server.stop()
    }
  })
})

test.describe('network mode board load/edit round trip (design doc §8)', () => {
  test('loads the home board from json-server, navigates to a child board, edits a card, and the edit persists via a real PATCH', async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const server = await startJsonServer(sampleDb(), JSON_SERVER_PORT)
    try {
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await page.getByTitle('Settings').click()
      await page.getByRole('button', { name: 'Network' }).click()
      await page
        .getByPlaceholder('http://localhost:1996')
        .fill(`http://localhost:${server.port}`)
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByPlaceholder('http://localhost:1996')).toHaveCount(
        0,
        { timeout: 10_000 },
      )

      // Home board renders the board-card fetched from json-server.
      await expect(page.locator('[data-testid="canvas-root"]')).toBeVisible()

      // Navigate into the child board (network mode design doc §6c) and
      // confirm its own network-fetched content renders. Clicking the
      // board card's icon+text activates (navigates in) — same click-to-
      // navigate semantics multiboard.spec.ts exercises for a board card.
      await page.locator('.board-name__activate').click()
      await expect(page.getByText('From the network')).toBeVisible({
        timeout: 10_000,
      })

      // Edit the card's content — network mode's write path (design doc
      // §5) maps this to a real PATCH /nodes/n1.
      // `.fill()` alone already dispatches the `input` event `Card.tsx`'s
      // onChange handler commits content from — no separate blur needed
      // (and `.blur()` here hangs: the card's own height-sync effect
      // re-measures on every content change, which keeps the element
      // "unstable" from Playwright's actionability check's point of view).
      await page
        .locator('.card', { hasText: 'From the network' })
        .locator('.card__content')
        .fill('Edited over the network')

      await expect
        .poll(
          async () => {
            const res = await page.request.get(
              `http://localhost:${server.port}/nodes/n1`,
            )
            const body = await res.json()
            return body.content as string
          },
          { timeout: 10_000 },
        )
        .toBe('Edited over the network')
    } finally {
      await server.stop()
    }
  })

  test("pasting a large image in network mode downsizes it under json-server's ~100KB body limit before POSTing (regression: this used to fail outright)", async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const server = await startJsonServer(sampleDb(), JSON_SERVER_PORT)
    try {
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await page.getByTitle('Settings').click()
      await page.getByRole('button', { name: 'Network' }).click()
      await page
        .getByPlaceholder('http://localhost:1996')
        .fill(`http://localhost:${server.port}`)
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByPlaceholder('http://localhost:1996')).toHaveCount(
        0,
        { timeout: 10_000 },
      )
      await page.locator('.board-name__activate').click()
      await expect(page.getByText('From the network')).toBeVisible({
        timeout: 10_000,
      })

      // Random noise, not a solid fill — a solid-color PNG compresses to
      // almost nothing regardless of dimensions and wouldn't exercise the
      // byte-size cap at all. 900x900 of noise comfortably exceeds 100KB
      // even after spec §2.6's existing 1200px-long-edge downsize.
      const dataUri = await makeNoisyImageDataUri(page, 900, 900)
      await dispatchPaste(page, { imageDataUri: dataUri })
      await expect(page.locator('.card--image')).toHaveCount(1, {
        timeout: 10_000,
      })
      // No save-failure toast (state/atoms/toasts.ts) — the old, pre-fix
      // behavior was a failed POST /images surfaced exactly this way.
      await expect(page.locator('.toast')).toHaveCount(0)

      await expect
        .poll(
          async () => {
            const res = await page.request.get(
              `http://localhost:${server.port}/images`,
            )
            const images = (await res.json()) as {
              id: string
              dataUri: string
            }[]
            return images.filter((image) => image.id !== 'img1').length
          },
          { timeout: 10_000 },
        )
        .toBe(1)

      const res = await page.request.get(
        `http://localhost:${server.port}/images`,
      )
      const images = (await res.json()) as { id: string; dataUri: string }[]
      const pasted = images.find((image) => image.id !== 'img1')
      const base64 =
        pasted?.dataUri.slice(pasted.dataUri.indexOf(',') + 1) ?? ''
      const decodedBytes = Math.floor((base64.length * 3) / 4)
      expect(decodedBytes).toBeLessThanOrEqual(90_000)
    } finally {
      await server.stop()
    }
  })

  test('editing a just-created image card in a later gesture succeeds against the id json-server actually assigned (regression: json-server discards the client-supplied id on POST — was a 404 on every follow-up PATCH)', async ({
    page,
  }) => {
    test.setTimeout(45_000)
    const server = await startJsonServer(sampleDb(), JSON_SERVER_PORT)
    try {
      await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
      await page.goto('/')
      await page.getByTitle('Settings').click()
      await page.getByRole('button', { name: 'Network' }).click()
      await page
        .getByPlaceholder('http://localhost:1996')
        .fill(`http://localhost:${server.port}`)
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByPlaceholder('http://localhost:1996')).toHaveCount(
        0,
        { timeout: 10_000 },
      )
      await page.locator('.board-name__activate').click()
      await expect(page.getByText('From the network')).toBeVisible({
        timeout: 10_000,
      })

      const dataUri = await makeImageDataUri(page, 100, 60)
      await dispatchPaste(page, { imageDataUri: dataUri })
      const card = page.locator('.card--image')
      await expect(card).toHaveCount(1, { timeout: 10_000 })

      async function fetchPastedNode(): Promise<
        { id: string; x: number } | undefined
      > {
        const res = await page.request.get(
          `http://localhost:${server.port}/nodes`,
        )
        const nodes = (await res.json()) as { id: string; x: number }[]
        return nodes.find((node) => node.id !== 'n0' && node.id !== 'n1')
      }

      // Wait for the create's debounced save to actually land server-side
      // (this app's own id for the card never changes — only the
      // *server's* record of it does, per api/networkIdRemap.ts — so this
      // polls for the row's existence, not a specific id) and capture its
      // original server-side x.
      await expect
        .poll(async () => (await fetchPastedNode()) !== undefined, {
          timeout: 10_000,
        })
        .toBe(true)
      const originalX = (await fetchPastedNode())?.x

      // A later, separate gesture (drag) — this is exactly the sequence
      // the reported bug reproduced from a real .har capture: create an
      // image card, then move/resize it, and the follow-up PATCH 404'd
      // because it still targeted this app's own (client-generated) id,
      // not the random one json-server actually stored the record under.
      const box = await card.boundingBox()
      if (!box) throw new Error('card not rendered')
      await page.mouse.move(box.x + 10, box.y + 10)
      await page.mouse.down()
      await page.mouse.move(box.x + 10 + 60, box.y + 10 + 40, { steps: 5 })
      await page.mouse.up()

      // No save-failure toast (state/atoms/toasts.ts) — the old, pre-fix
      // behavior surfaced the 404 exactly this way.
      await expect(page.locator('.toast')).toHaveCount(0)

      // The move actually persisted server-side (a different x than
      // right after creation), under whichever id json-server assigned.
      await expect
        .poll(async () => (await fetchPastedNode())?.x, { timeout: 10_000 })
        .not.toBe(originalX)
    } finally {
      await server.stop()
    }
  })
})
