import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchLinkMetadata } from './linkMetadata'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fetchLinkMetadata', () => {
  it('resolves title/imageUrl on a successful response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        data: {
          title: 'Example',
          image: { url: 'https://img.example.com/a.png' },
        },
      }),
    )
    const result = await fetchLinkMetadata('https://example.com', fetchImpl)
    expect(result).toEqual({
      title: 'Example',
      imageUrl: 'https://img.example.com/a.png',
    })
  })

  it('falls back to the logo url when no image is present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        data: {
          title: 'Example',
          logo: { url: 'https://img.example.com/logo.png' },
        },
      }),
    )
    const result = await fetchLinkMetadata('https://example.com', fetchImpl)
    expect(result.imageUrl).toBe('https://img.example.com/logo.png')
  })

  it('retries on failure and succeeds on a later attempt', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(
        jsonResponse({ status: 'success', data: { title: 'Recovered' } }),
      )

    const promise = fetchLinkMetadata('https://example.com', fetchImpl)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.title).toBe('Recovered')
  })

  it('throws after exhausting all retry attempts', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('persistent failure'))

    const promise = fetchLinkMetadata('https://example.com', fetchImpl)
    const expectation = expect(promise).rejects.toThrow('persistent failure')
    await vi.runAllTimersAsync()
    await expectation

    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('treats a non-ok response as a failure worth retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500))
    const promise = fetchLinkMetadata('https://example.com', fetchImpl)
    const expectation = expect(promise).rejects.toThrow()
    await vi.runAllTimersAsync()
    await expectation
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
