// PostgREST (v12+; checked against the v16 OpenAPI in ctx/support/
// 261019-pgrest-kanvy-openapi.json) — differences from json-server are
// catalogued in ctx/notes/261019-pgrest-vs-json-server-api-differences.md.
// In short: snake_case columns, `field=eq.value` / `field=in.(a,b)`
// filters, `limit`/`offset` pagination answered with a bare array (total
// in `Content-Range` when asked for via `Prefer: count=exact`), no
// `/<collection>/<id>` routes (every single-row write is a filter), a
// default empty body on POST, and a 204 for a write that matched no rows.

import { createFieldMapping } from './fieldMapping'
import {
  type Collection,
  type Dialect,
  type DialectRequest,
  expectObject,
  expectObjectArray,
  type Filter,
  type PageCursor,
  UnexpectedResponseError,
} from './types'

/** Page size for each list request. A server-side `db-max-rows` below this is fine — paging advances by the rows actually returned. */
export const POSTGREST_PAGE_SIZE = 200

const fields = createFieldMapping('snake')

/**
 * An `in.(…)` list member. Double-quoted (with `\` and `"` escaped)
 * whenever it holds a character PostgREST's filter grammar reserves, so a
 * value can never break out of the list.
 */
export function quoteInValue(value: string): string {
  return /^[^,.:()"\\\s]+$/.test(value)
    ? value
    : `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`
}

function filterParam(collection: Collection, filter: Filter): [string, string] {
  const field = fields.toWireField(collection, filter.field)
  switch (filter.op) {
    case 'eq':
      return [field, `eq.${filter.value}`]
    case 'in':
      return [field, `in.(${filter.values.map(quoteInValue).join(',')})`]
    case 'before':
      return [field, `lt.${filter.value}`]
  }
}

/**
 * The `?id=eq.<id>` filter every single-row write is addressed by. Refuses
 * an empty id outright: a PostgREST write with no filter at all applies to
 * *every* row in the table.
 */
function idFilter(collection: Collection, id: string): [string, string] {
  if (id === '') {
    throw new Error(`refusing to build a ${collection} write without an id`)
  }
  return filterParam(collection, { field: 'id', op: 'eq', value: id })
}

/** Writes ask for the affected rows' ids back, so a write that matched nothing is distinguishable from one that didn't (both are 2xx). */
function rowWrite(
  method: 'PATCH' | 'DELETE',
  collection: Collection,
  id: string,
  {
    body,
    guards = [],
  }: { body?: Record<string, unknown>; guards?: readonly Filter[] } = {},
): DialectRequest {
  return {
    method,
    path: collection,
    query: [
      idFilter(collection, id),
      ...guards.map((guard) => filterParam(collection, guard)),
      ['select', 'id'],
    ],
    headers: { Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body }),
  }
}

function offsetOf(cursor: PageCursor | null): number {
  return typeof cursor === 'number' ? cursor : 0
}

/** The total row count from a `Content-Range: 0-199/1234` header, or `null` when the server didn't report one (`…/*`). */
export function contentRangeTotal(header: string | undefined): number | null {
  const match = header?.match(/\/(\d+)$/)
  return match?.[1] === undefined ? null : Number(match[1])
}

export const postgrestDialect = {
  id: 'postgrest',
  label: 'PostgREST',
  exampleBaseUrl: 'http://localhost:3000',
  // No body-size limit of PostgREST's own; spec §2.6's 1200px downsizing
  // still applies. A proxy in front of it may impose one.
  limits: { maxImageBytes: null },
  // Guards are ordinary filters on the DELETE, so Postgres checks them in
  // the same statement that deletes the row.
  atomicDeleteGuards: true,

  connectionTest: () => ({
    method: 'GET',
    path: 'boards',
    query: [
      ['select', 'id'],
      ['limit', '1'],
    ],
  }),

  // `order=id` makes offset paging stable — without it, PostgREST's row
  // order is unspecified and pages could skip or repeat rows.
  listRequest: ({ collection, filters, cursor }) => ({
    method: 'GET',
    path: collection,
    query: [
      ...filters.map((filter) => filterParam(collection, filter)),
      ['order', 'id'],
      ['limit', String(POSTGREST_PAGE_SIZE)],
      ['offset', String(offsetOf(cursor))],
    ],
    headers: { Prefer: 'count=exact' },
  }),

  // Advances by the rows actually returned, not the requested page size,
  // so a lower server-side `db-max-rows` cap can't silently drop rows.
  // Without a reported total, only an empty page ends the loop.
  parseListResponse: ({ collection, cursor, response }) => {
    const rows = expectObjectArray(response.body, `GET /${collection}`).map(
      (row) => fields.fromWireRow(collection, row),
    )
    const next = offsetOf(cursor) + rows.length
    const total = contentRangeTotal(response.headers['content-range'])
    const done = rows.length === 0 || (total !== null && next >= total)
    return { rows, next: done ? null : next }
  },

  // `return=representation` plus the single-object media type: the created
  // row comes back as one object (default is an empty body).
  createRequest: ({ collection, value }) => ({
    method: 'POST',
    path: collection,
    headers: {
      Prefer: 'return=representation',
      Accept: 'application/vnd.pgrst.object+json',
    },
    body: fields.toWireRow(collection, value),
  }),

  parseCreateResponse: ({ collection, response }) => {
    const row = fields.fromWireRow(
      collection,
      expectObject(response.body, `POST /${collection}`),
    )
    if (typeof row.id !== 'string') {
      throw new UnexpectedResponseError(
        `expected POST /${collection} to return the created row's id`,
      )
    }
    return { ...row, id: row.id }
  },

  updateRequest: ({ collection, id, patch }) =>
    rowWrite('PATCH', collection, id, {
      body: fields.toWireRow(collection, patch),
    }),

  deleteRequest: ({ collection, id, guards }) =>
    rowWrite('DELETE', collection, id, { guards }),

  parseWriteResponse: ({ collection, method, response }) =>
    expectObjectArray(response.body, `${method} /${collection}`).length === 0
      ? 'not-found'
      : 'ok',

  // `{ code, message, details, hint }` (PostgREST and Postgres errors alike).
  errorMessage: (response) => {
    const body = response.body
    if (typeof body !== 'object' || body === null) return null
    const { code, message, hint } = body as Record<string, unknown>
    if (typeof message !== 'string') return null
    const prefix = typeof code === 'string' ? `${code}: ` : ''
    const suffix = typeof hint === 'string' ? ` (hint: ${hint})` : ''
    return `${prefix}${message}${suffix}`
  },
} satisfies Dialect
