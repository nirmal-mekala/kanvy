import { expect, test } from '@playwright/test'
import { ROOT_BOARD_ID, seedBoard } from './fixtures/board'
import { type FakePgDb, routeFakePostgrest } from './fixtures/fakePostgrest'

// The PostgREST backend preset (ctx/notes/261020-network-dialects.md):
// picking it in the settings modal makes every network-mode request speak
// PostgREST — snake_case columns, `eq.`/`in.(…)` filters, offset paging,
// id-filtered writes — against a route-mocked stand-in
// (e2e/fixtures/fakePostgrest.ts), since no real PostgREST is available
// to this environment.

const PG_BASE_URL = 'http://pgrest.e2e.test'
const NOW = '2026-01-01T00:00:00.123456+00:00'
const HOME = 'a873586f-45ef-e61f-781a-03a9ef7bc643'
const CHILD = '0608c8d6-4d06-7b34-5f32-31a6be97e08b'

const EMPTY_LOCAL_DOCUMENT = {
  version: 7,
  nodes: [],
  edges: [],
  boards: [
    {
      id: ROOT_BOARD_ID,
      title: 'Home',
      status: 'active',
      isRoot: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  images: [],
}

/** Every column on every row, nulls included, the way PostgREST returns them. */
function pgDb(): FakePgDb {
  const board = (id: string, title: string, isRoot: boolean) => ({
    id,
    title,
    status: 'active',
    is_root: isRoot,
    created_at: NOW,
    updated_at: NOW,
  })
  return {
    boards: [board(HOME, 'Home', true), board(CHILD, 'Postgres board', false)],
    nodes: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        board_id: HOME,
        status: 'active',
        color: 'gray',
        x: 88,
        y: 104,
        w: 224,
        h: 90,
        position: 0,
        task: 'none',
        created_at: NOW,
        updated_at: NOW,
        node_type: 'card',
        content: '',
        card_type: 'board',
        size: null,
        pattern: null,
        image_id: null,
        link_url: null,
        link_title: null,
        link_image_url: null,
        board_ref: CHILD,
      },
    ],
    edges: [],
    images: [],
  }
}

test('the PostgREST preset loads the home board and writes new content in PostgREST’s shape', async ({
  page,
}) => {
  const pg = await routeFakePostgrest(page, PG_BASE_URL, pgDb())
  await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
  await page.goto('/')

  await page.getByTitle('Settings').click()
  await page.getByLabel('Backend').selectOption({ label: 'PostgREST' })
  await page.getByPlaceholder('http://localhost:3000').fill(PG_BASE_URL)
  await page.getByRole('button', { name: 'Save & Connect' }).click()
  await expect(page.getByLabel('Backend')).toHaveCount(0, { timeout: 10_000 })

  // The server's snake_case board card, read back into the app's shape.
  await expect(page.locator('.card--board')).toHaveCount(1)
  await expect(page.getByText('Postgres board')).toBeVisible()

  // A double-click mints a board + its board card in one gesture: the
  // card's POST must carry the board's *server-assigned* uuid, in
  // snake_case, with no client id.
  await page
    .locator('[data-testid="canvas-root"]')
    .dblclick({ position: { x: 500, y: 400 } })
  await expect(page.locator('.card--board')).toHaveCount(2)
  await expect
    .poll(() => pg.writes.filter((w) => w.method === 'POST').length)
    .toBe(2)
  // (A height-fit PATCH of the seeded card may precede these — the app
  // measures rendered cards on load.)
  const [boardPost, nodePost] = pg.writes.filter((w) => w.method === 'POST')
  expect(boardPost?.collection).toBe('boards')
  expect(boardPost?.body).toMatchObject({ is_root: false })
  expect(boardPost?.body).not.toHaveProperty('id')
  const createdBoardId = pg.db.boards?.at(-1)?.id
  expect(nodePost?.collection).toBe('nodes')
  expect(nodePost?.body).toMatchObject({
    board_id: HOME,
    board_ref: createdBoardId,
    node_type: 'card',
    card_type: 'board',
  })
  expect(nodePost?.body).not.toHaveProperty('boardId')
})

test('the chosen preset survives a reload (persisted with the base URL)', async ({
  page,
}) => {
  await routeFakePostgrest(page, PG_BASE_URL, pgDb())
  await seedBoard(page, EMPTY_LOCAL_DOCUMENT, 'kanvy.board')
  await page.goto('/')
  await page.getByTitle('Settings').click()
  await page.getByLabel('Backend').selectOption({ label: 'PostgREST' })
  await page.getByPlaceholder('http://localhost:3000').fill(PG_BASE_URL)
  await page.getByRole('button', { name: 'Save & Connect' }).click()
  await expect(page.getByLabel('Backend')).toHaveCount(0, { timeout: 10_000 })

  await page.reload()
  // The boot-time reconnect only succeeds if it spoke PostgREST again.
  await expect(page.getByText('Postgres board')).toBeVisible({
    timeout: 10_000,
  })
  await page.getByTitle('Settings').click()
  await expect(page.getByLabel('Backend')).toHaveValue('postgrest')
})
