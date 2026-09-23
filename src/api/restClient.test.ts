import { describe, expect, it, vi } from 'vitest'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import { fetchCollection, testConnection } from './restClient'

function paginatedResponse(data: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        first: 1,
        prev: null,
        next: null,
        last: 1,
        pages: 1,
        items: data.length,
        data,
      }),
  } as Response
}

describe('testConnection', () => {
  it('hits GET /boards?_page=1&_per_page=1 with no auth header when the token is blank', async () => {
    const config: NetworkConfig = { baseUrl: 'http://x:1996', authToken: '' }
    const fetchImpl = vi.fn().mockResolvedValue(paginatedResponse([]))
    await testConnection(config, fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/boards')
    expect(parsed.searchParams.get('_page')).toBe('1')
    expect(parsed.searchParams.get('_per_page')).toBe('1')
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined()
  })

  it('sends Authorization: Bearer <token> when a token is set', async () => {
    const config: NetworkConfig = {
      baseUrl: 'http://x:1996',
      authToken: 'secret',
    }
    const fetchImpl = vi.fn().mockResolvedValue(paginatedResponse([]))
    await testConnection(config, fetchImpl)
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer secret',
    )
  })

  it('throws on a non-ok response', async () => {
    const config: NetworkConfig = { baseUrl: 'http://x:1996', authToken: '' }
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401 } as Response)
    await expect(testConnection(config, fetchImpl)).rejects.toThrow(/401/)
  })
})

describe('fetchCollection', () => {
  it('applies an optional query param (e.g. boardId) to every request', async () => {
    const config: NetworkConfig = { baseUrl: 'http://x:1996', authToken: '' }
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(paginatedResponse([{ id: 'n1' }]))
    const result = await fetchCollection(
      config,
      'nodes',
      { boardId: 'root' },
      fetchImpl,
    )
    expect(result).toEqual([{ id: 'n1' }])
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(new URL(url).searchParams.get('boardId')).toBe('root')
  })
})
