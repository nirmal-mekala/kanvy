import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../schema/board'
import { mergeBoardContent } from './networkBoardLoader'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

function page<T>(data: T[]) {
  return {
    first: 1,
    prev: null,
    next: null,
    last: 1,
    pages: 1,
    items: data.length,
    data,
  }
}

function emptyBoard(): Board {
  return {
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
}

describe('mergeBoardContent', () => {
  it('appends freshly-fetched nodes/edges/images to an empty document', () => {
    const board = emptyBoard()
    const content = {
      nodes: [{ id: 'n1' } as never],
      edges: [{ id: 'e1' } as never],
      images: [{ id: 'img1', dataUri: 'data:x' }],
    }
    const result = mergeBoardContent(board, content)
    expect(result.nodes).toEqual([{ id: 'n1' }])
    expect(result.edges).toEqual([{ id: 'e1' }])
    expect(result.images).toEqual([{ id: 'img1', dataUri: 'data:x' }])
  })

  it('dedupes by id — a re-fetch of already-resident content is a no-op on those ids', () => {
    const board: Board = {
      ...emptyBoard(),
      nodes: [{ id: 'n1', x: 0 } as never],
    }
    const content = {
      nodes: [{ id: 'n1', x: 99 } as never, { id: 'n2' } as never],
      edges: [],
      images: [],
    }
    const result = mergeBoardContent(board, content)
    // The already-resident n1 keeps its own copy; only n2 is newly appended.
    expect(result.nodes).toEqual([{ id: 'n1', x: 0 }, { id: 'n2' }])
  })

  it('leaves `boards` untouched — only nodes/edges/images are merged here', () => {
    const board = emptyBoard()
    const result = mergeBoardContent(board, {
      nodes: [],
      edges: [],
      images: [],
    })
    expect(result.boards).toBe(board.boards)
  })
})

// Fresh module instance per test (same rationale as boardAccessResolver
// .test.ts) — `attemptBootReconnect` calls `getDefaultStore()` internally,
// so the test must observe that same store instance via a fresh `jotai`
// import too.
async function freshState() {
  vi.resetModules()
  const { getDefaultStore } = await import('jotai')
  const { accessModeAtom } = await import('./atoms/networkSettings')
  const { attemptBootReconnect } = await import('./networkBoardLoader')
  return { store: getDefaultStore(), accessModeAtom, attemptBootReconnect }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('attemptBootReconnect', () => {
  it('switches to Network mode on a successful connection', async () => {
    const s = await freshState()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url)
        if (
          u.pathname.endsWith('/boards') ||
          u.pathname.endsWith('/nodes') ||
          u.pathname.endsWith('/edges')
        ) {
          return new Response(JSON.stringify(page([])), { status: 200 })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const result = await s.attemptBootReconnect({
      baseUrl: 'https://api.example.test/',
      authToken: '',
    })

    expect(result).toBe('connected')
    expect(s.store.get(s.accessModeAtom)).toBe('network')
  })

  it('stays in Local mode when the connection fails', async () => {
    const s = await freshState()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )

    const result = await s.attemptBootReconnect({
      baseUrl: 'https://api.example.test/',
      authToken: '',
    })

    expect(result).toBe('failed')
    expect(s.store.get(s.accessModeAtom)).toBe('local')
  })
})
