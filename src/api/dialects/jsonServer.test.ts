import { describe, expect, it } from 'vitest'
import { jsonServerDialect } from './jsonServer'
import type { WireResponse } from './types'

function envelope(data: unknown[], next: number | null): WireResponse {
  return {
    status: 200,
    headers: {},
    body: { first: 1, prev: null, next, last: 2, pages: 2, items: 3, data },
  }
}

describe('jsonServerDialect', () => {
  it('pages by _page, starting at 1', () => {
    const query = (cursor: number | null) =>
      jsonServerDialect.listRequest({
        collection: 'nodes',
        filters: [],
        cursor,
      }).query
    expect(query(null)).toContainEqual(['_page', '1'])
    expect(query(3)).toContainEqual(['_page', '3'])
  })

  it('advances to the next page until the envelope says there is none', () => {
    expect(
      jsonServerDialect.parseListResponse({
        collection: 'nodes',
        cursor: null,
        response: envelope([{ id: 'a' }], 2),
      }),
    ).toEqual({ rows: [{ id: 'a' }], next: 2 })
    expect(
      jsonServerDialect.parseListResponse({
        collection: 'nodes',
        cursor: 2,
        response: envelope([{ id: 'b' }], null),
      }).next,
    ).toBeNull()
  })

  it('stops on an empty page even if `next` claims there is more (defensive against a non-paginating server)', () => {
    expect(
      jsonServerDialect.parseListResponse({
        collection: 'nodes',
        cursor: null,
        response: envelope([], 2),
      }).next,
    ).toBeNull()
  })

  it('rejects a body without the pagination envelope', () => {
    expect(() =>
      jsonServerDialect.parseListResponse({
        collection: 'nodes',
        cursor: null,
        response: { status: 200, headers: {}, body: { data: 'x', next: null } },
      }),
    ).toThrow('expected GET /nodes data to be a JSON array')
  })
})
