import { describe, expect, it, vi } from 'vitest'
import { fetchAllPages, type PaginatedResponse } from './fetchAllPages'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

function page<T>(data: T[], next: number | null): PaginatedResponse<T> {
  return { first: 1, prev: null, next, last: 2, pages: 2, items: 3, data }
}

describe('fetchAllPages', () => {
  it('concatenates every page until `next` is null', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page([{ id: 'a' }, { id: 'b' }], 2)))
      .mockResolvedValueOnce(jsonResponse(page([{ id: 'c' }], null)))

    const result = await fetchAllPages(
      'http://localhost:1996/nodes',
      {},
      fetchImpl,
    )
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('stops after a single request when the collection fits on one page', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page([{ id: 'a' }], null)))

    const result = await fetchAllPages('http://x/boards', {}, fetchImpl)
    expect(result).toEqual([{ id: 'a' }])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('preserves existing query params (e.g. a boardId filter) across every page request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(page([], null)))

    await fetchAllPages('http://x/nodes?boardId=root', {}, fetchImpl)
    const calledUrl = new URL(fetchImpl.mock.calls[0]?.[0] as string)
    expect(calledUrl.searchParams.get('boardId')).toBe('root')
    expect(calledUrl.searchParams.get('_page')).toBe('1')
  })

  it('stops on an empty page even if `next` claims there is more (defensive against a non-paginating server)', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(page([], 2)))

    const result = await fetchAllPages('http://x/nodes', {}, fetchImpl)
    expect(result).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 401))

    await expect(
      fetchAllPages('http://x/nodes', {}, fetchImpl),
    ).rejects.toThrow(/401/)
  })
})
