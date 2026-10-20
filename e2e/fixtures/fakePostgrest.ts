import type { Page, Route } from '@playwright/test'

// A tiny in-browser-route PostgREST stand-in for the PostgREST dialect's
// e2e (api/dialects/postgrest.ts) — no real PostgREST/Postgres is
// available to the e2e environment, so `page.route` answers the app's
// requests instead, honoring just what the dialect sends:
// `col=eq.v` / `col=in.(a,b)` / `col=lt.v` filters, `limit`/`offset` with a
// `Content-Range` total, `Prefer: return=representation` on writes, and
// the single-object `Accept` on POST. Rows are snake_case, every column
// present (nulls included), ids are server-assigned uuids — like the real
// thing. Unknown query params answer 400 PGRST100, as PostgREST does.

type Row = Record<string, unknown> & { id: string }
export type FakePgDb = Record<string, Row[]>

export interface FakePostgrest {
  readonly db: FakePgDb
  /** Every write the app sent, as `METHOD /collection` plus its parsed body. */
  readonly writes: { method: string; collection: string; body: unknown }[]
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset'])

/** Whether a column `value` meets one PostgREST filter (`eq.`, `lt.`, `in.(…)`). */
function meets(value: string, raw: string): boolean {
  if (raw.startsWith('eq.')) return value === raw.slice(3)
  if (raw.startsWith('lt.')) return Date.parse(value) < Date.parse(raw.slice(3))
  if (raw.startsWith('in.(') && raw.endsWith(')')) {
    return raw
      .slice(4, -1)
      .split(',')
      .map((m) => m.replace(/^"(.*)"$/, '$1'))
      .includes(value)
  }
  throw new Error(`failed to parse filter (${raw})`)
}

function matches(row: Row, params: URLSearchParams): boolean {
  return [...params].every(
    ([key, raw]) => RESERVED.has(key) || meets(String(row[key]), raw),
  )
}

function respond(route: Route, status: number, body: unknown, headers = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*', ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
  })
}

function preflight(route: Route) {
  return route.fulfill({
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE',
      'Access-Control-Expose-Headers': 'Content-Range',
    },
  })
}

/** `rows` paged by `limit`/`offset`, with the total in `Content-Range`. */
function respondPage(route: Route, rows: Row[], params: URLSearchParams) {
  const offset = Number(params.get('offset') ?? 0)
  const limit = Number(params.get('limit') ?? rows.length)
  const page = rows.slice(offset, offset + limit)
  const range = page.length ? `${offset}-${offset + page.length - 1}` : '*'
  return respond(route, 200, page, {
    'Access-Control-Expose-Headers': 'Content-Range',
    'Content-Range': `${range}/${rows.length}`,
  })
}

export async function routeFakePostgrest(
  page: Page,
  baseUrl: string,
  db: FakePgDb,
): Promise<FakePostgrest> {
  const writes: FakePostgrest['writes'] = []
  let nextId = 1

  /** Applies a POST/PATCH/DELETE to `table`; `rows` are the rows its filters matched. */
  function write(route: Route, collection: string, table: Row[], rows: Row[]) {
    const method = route.request().method()
    const body = route.request().postDataJSON() as Record<
      string,
      unknown
    > | null
    writes.push({ method, collection, body })
    if (method === 'POST') {
      const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
      const row = { ...body, id } as Row
      table.push(row)
      return respond(route, 201, row)
    }
    if (method === 'PATCH') {
      for (const row of rows) Object.assign(row, body)
    } else {
      db[collection] = table.filter((row) => !rows.includes(row))
    }
    return respond(
      route,
      200,
      rows.map(({ id }) => ({ id })),
    )
  }

  await page.route(`${baseUrl}/**`, async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') return preflight(route)
    const url = new URL(route.request().url())
    const collection = url.pathname.slice(1)
    const table = db[collection]
    if (!table) return respond(route, 404, { code: '42P01', message: 'no' })
    let rows: Row[]
    try {
      rows = table.filter((row) => matches(row, url.searchParams))
    } catch (error) {
      return respond(route, 400, {
        code: 'PGRST100',
        message: (error as Error).message,
      })
    }
    return method === 'GET'
      ? respondPage(route, rows, url.searchParams)
      : write(route, collection, table, rows)
  })
  return { db, writes }
}
