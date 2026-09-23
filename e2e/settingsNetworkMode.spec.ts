import { expect, test } from '@playwright/test'
import { seedBoard } from './fixtures/board'
import { startJsonServer } from './fixtures/jsonServer'

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
// playwright-remote-browser skill) can reach — one of this container's
// host-forwarded ports, not an arbitrary one. Defaults to 1994
// (KANVY_E2E_PORT itself typically claims 1993 for the Vite dev server).
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
    const server = await startJsonServer(sampleDb(), JSON_SERVER_PORT + 1)
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
})
