// json-server v1 (ctx/support/260923-json-server-docs.md) — the backend
// network mode was first built against, and `pnpm dev:server`'s. Field
// names are this app's own (the downloaded board JSON is served as-is),
// so there's no field mapping. Filters are `field=value` / `field:in=a,b`;
// pagination is `_page`/`_per_page`, answered with a `{ data, next, … }`
// envelope; single entities live at `/<collection>/<id>`.

import {
  type Dialect,
  expectObject,
  expectObjectArray,
  type Filter,
  UnexpectedResponseError,
} from './types'

/** Page size for each list request — large enough that a typical board's collection fits in one or two pages, small enough to stay a reasonable single-request payload. */
const JSON_SERVER_PER_PAGE = 200

function filterParam(filter: Filter): [string, string] {
  switch (filter.op) {
    case 'eq':
      return [filter.field, filter.value]
    case 'in':
      return [`${filter.field}:in`, filter.values.join(',')]
    case 'before':
      return [`${filter.field}:lt`, filter.value]
  }
}

function pageNumber(cursor: string | number | null): number {
  return typeof cursor === 'number' ? cursor : 1
}

export const jsonServerDialect = {
  id: 'json-server',
  label: 'json-server',
  exampleBaseUrl: 'http://localhost:1996',
  limits: {
    // json-server's default body-size limit is ~100KB — a pasted/dropped
    // image already downsized to spec §2.6's 1200px-long-edge cap can
    // still exceed that for a busy/high-detail PNG. Targets comfortably
    // under the limit, leaving headroom for the JSON envelope
    // (`{"dataUri":"..."}`) around the base64 payload itself.
    maxImageBytes: 90_000,
  },
  // `DELETE /<collection>/<id>` takes no conditions.
  atomicDeleteGuards: false,

  connectionTest: () => ({
    method: 'GET',
    path: 'boards',
    query: [
      ['_page', '1'],
      ['_per_page', '1'],
    ],
  }),

  listRequest: ({ collection, filters, cursor }) => ({
    method: 'GET',
    path: collection,
    query: [
      ...filters.map(filterParam),
      ['_page', String(pageNumber(cursor))],
      ['_per_page', String(JSON_SERVER_PER_PAGE)],
    ],
  }),

  // Stops once the server reports no next page, or a page comes back
  // empty — defensive against a server that doesn't paginate at all and
  // returns everything on page 1.
  parseListResponse: ({ collection, cursor, response }) => {
    const envelope = expectObject(response.body, `GET /${collection}`)
    const rows = expectObjectArray(envelope.data, `GET /${collection} data`)
    if (envelope.next !== null && typeof envelope.next !== 'number') {
      throw new UnexpectedResponseError(
        `expected GET /${collection}'s next to be a page number or null`,
      )
    }
    const done = envelope.next === null || rows.length === 0
    return { rows, next: done ? null : pageNumber(cursor) + 1 }
  },

  createRequest: ({ collection, value }) => ({
    method: 'POST',
    path: collection,
    body: value,
  }),

  parseCreateResponse: ({ collection, response }) => {
    const row = expectObject(response.body, `POST /${collection}`)
    if (typeof row.id !== 'string') {
      throw new UnexpectedResponseError(
        `expected POST /${collection} to return the created row's id`,
      )
    }
    return { ...row, id: row.id }
  },

  updateRequest: ({ collection, id, patch }) => ({
    method: 'PATCH',
    path: `${collection}/${encodeURIComponent(id)}`,
    body: patch,
  }),

  deleteRequest: ({ collection, id }) => ({
    method: 'DELETE',
    path: `${collection}/${encodeURIComponent(id)}`,
  }),

  // A missing id is already a 404 (a non-ok response restClient throws on).
  parseWriteResponse: () => 'ok',

  errorMessage: (response) =>
    typeof response.body === 'string' && response.body.trim() !== ''
      ? response.body.trim()
      : null,
} satisfies Dialect
