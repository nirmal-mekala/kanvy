import { describe, expect, it } from 'vitest'
import {
  contentRangeTotal,
  POSTGREST_PAGE_SIZE,
  postgrestDialect,
  quoteInValue,
} from './postgrest'
import type { WireResponse } from './types'

function wire(
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
): WireResponse {
  return { status, headers, body }
}

describe('postgrestDialect', () => {
  it('lists with stable ordering, a page size, an offset cursor and an exact count', () => {
    const request = postgrestDialect.listRequest({
      collection: 'edges',
      filters: [{ field: 'fromNodeId', op: 'in', values: ['a', 'b'] }],
      cursor: 400,
    })
    expect(request.query).toEqual([
      ['from_node_id', 'in.(a,b)'],
      ['order', 'id'],
      ['limit', String(POSTGREST_PAGE_SIZE)],
      ['offset', '400'],
    ])
    expect(request.headers).toEqual({ Prefer: 'count=exact' })
  })

  it('advances by the rows actually returned, so a lower server-side db-max-rows cap drops nothing', () => {
    const page = postgrestDialect.parseListResponse({
      collection: 'nodes',
      cursor: null,
      response: wire([{ id: 'a' }, { id: 'b' }], {
        'content-range': '0-1/5',
      }),
    })
    expect(page.next).toBe(2)
  })

  it('ends at the reported total, or on an empty page when there is no total', () => {
    const atTotal = postgrestDialect.parseListResponse({
      collection: 'nodes',
      cursor: 3,
      response: wire([{ id: 'd' }, { id: 'e' }], { 'content-range': '3-4/5' }),
    })
    expect(atTotal.next).toBeNull()
    const noTotal = postgrestDialect.parseListResponse({
      collection: 'nodes',
      cursor: 3,
      response: wire([{ id: 'd' }], { 'content-range': '3-3/*' }),
    })
    expect(noTotal.next).toBe(4)
    const empty = postgrestDialect.parseListResponse({
      collection: 'nodes',
      cursor: 4,
      response: wire([], { 'content-range': '*/*' }),
    })
    expect(empty.next).toBeNull()
  })

  it('returns all-columns rows camelCased, nulls included (the Zod entity schemas strip what a kind lacks)', () => {
    const page = postgrestDialect.parseListResponse({
      collection: 'nodes',
      cursor: null,
      response: wire([{ id: 'c', node_type: 'container', card_type: null }]),
    })
    expect(page.rows).toEqual([
      { id: 'c', nodeType: 'container', cardType: null },
    ])
  })

  it('never builds a write without an id filter (a filterless PostgREST write hits every row)', () => {
    expect(() =>
      postgrestDialect.deleteRequest({
        collection: 'nodes',
        id: '',
        guards: [],
      }),
    ).toThrow(/without an id/)
  })

  it('reads a write that matched nothing as not-found', () => {
    expect(
      postgrestDialect.parseWriteResponse({
        collection: 'nodes',
        method: 'PATCH',
        response: wire([]),
      }),
    ).toBe('not-found')
    expect(
      postgrestDialect.parseWriteResponse({
        collection: 'nodes',
        method: 'PATCH',
        response: wire([{ id: 'n1' }]),
      }),
    ).toBe('ok')
  })

  it('formats PostgREST/Postgres error bodies, and ignores anything else', () => {
    expect(
      postgrestDialect.errorMessage(
        wire(
          {
            code: '23503',
            message: 'insert or update on table "edges" violates foreign key',
            details: null,
            hint: null,
          },
          {},
          409,
        ),
      ),
    ).toBe('23503: insert or update on table "edges" violates foreign key')
    expect(
      postgrestDialect.errorMessage(
        wire({ code: 'PGRST204', message: 'no column', hint: 'check it' }),
      ),
    ).toBe('PGRST204: no column (hint: check it)')
    expect(postgrestDialect.errorMessage(wire('<html>'))).toBeNull()
  })
})

describe('quoteInValue', () => {
  it.each([
    [
      'a873586f-45ef-e61f-781a-03a9ef7bc643',
      'a873586f-45ef-e61f-781a-03a9ef7bc643',
    ],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say \\"hi\\""'],
    ['(x)', '"(x)"'],
  ])('%s → %s', (value, quoted) => {
    expect(quoteInValue(value)).toBe(quoted)
  })
})

describe('contentRangeTotal', () => {
  it.each([
    ['0-199/1234', 1234],
    ['*/0', 0],
    ['0-199/*', null],
    [undefined, null],
  ])('%s → %s', (header, total) => {
    expect(contentRangeTotal(header)).toBe(total)
  })
})
