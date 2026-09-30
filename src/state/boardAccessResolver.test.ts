import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../schema/board'
import { SCHEMA_VERSION } from '../schema/board'
import { ROOT_BOARD_ID } from '../schema/boardMeta'

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

const now = '2026-01-01T00:00:00.000Z'

function boardWith(
  ids: readonly (string | { id: string; status: 'active' | 'trashed' })[],
): Board {
  return {
    version: SCHEMA_VERSION,
    nodes: [],
    edges: [],
    boards: ids.map((entry) => {
      const { id, status } =
        typeof entry === 'string'
          ? { id: entry, status: 'active' as const }
          : entry
      return { id, title: id, status, createdAt: now, updatedAt: now }
    }),
    images: [],
  }
}

/** json-server's paginated envelope, one page, done. */
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

// Every helper this module resolves against — networkSettings' localStorage
// read at import time, networkBoardLoader's/storage's own module state — is
// re-read fresh per test, same as boards.test.ts/nodes.test.ts's own
// `freshState()` pattern. `boardAccessResolver.ts` calls `getDefaultStore()`
// internally rather than taking an injected store, so the test must import
// `jotai` itself through the same fresh module graph to observe/seed the
// exact store instance the module under test reads and writes.
async function freshState() {
  vi.resetModules()
  const { getDefaultStore } = await import('jotai')
  const { accessModeAtom, networkConfigAtom } = await import(
    './atoms/networkSettings'
  )
  const { currentBoardAtom } = await import('./history/boardHistoryAtom')
  const { boardsAtom } = await import('./atoms/boards')
  const { resolveBoardAccess } = await import('./boardAccessResolver')
  const { writeBoard } = await import('./persistence/storage')
  return {
    store: getDefaultStore(),
    accessModeAtom,
    networkConfigAtom,
    currentBoardAtom,
    boardsAtom,
    resolveBoardAccess,
    writeBoard,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveBoardAccess', () => {
  it('resolves immediately when the board is already in the current mode', async () => {
    const s = await freshState()
    s.store.set(s.accessModeAtom, 'network')
    s.store.set(s.currentBoardAtom, boardWith([ROOT_BOARD_ID, 'net-1']))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(s.resolveBoardAccess('net-1')).resolves.toBe('ok')
    expect(s.store.get(s.accessModeAtom)).toBe('network')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('switches to Local mode when a board only exists in local storage', async () => {
    const s = await freshState()
    s.writeBoard(boardWith([ROOT_BOARD_ID, 'local-only']))
    s.store.set(s.accessModeAtom, 'network')
    s.store.set(s.currentBoardAtom, boardWith([ROOT_BOARD_ID, 'net-1']))

    await expect(s.resolveBoardAccess('local-only')).resolves.toBe('ok')
    expect(s.store.get(s.accessModeAtom)).toBe('local')
    expect(s.store.get(s.boardsAtom).map((b) => b.id)).toContain('local-only')
  })

  it('does not switch modes when the board is trashed in local storage', async () => {
    const s = await freshState()
    s.writeBoard(
      boardWith([ROOT_BOARD_ID, { id: 'trashed-1', status: 'trashed' }]),
    )
    s.store.set(s.accessModeAtom, 'network')
    s.store.set(s.currentBoardAtom, boardWith([ROOT_BOARD_ID]))

    await expect(s.resolveBoardAccess('trashed-1')).resolves.toBe('not-found')
    expect(s.store.get(s.accessModeAtom)).toBe('network')
  })

  it('switches to Network mode when a board is found there after a successful connection', async () => {
    const s = await freshState()
    s.store.set(s.accessModeAtom, 'local')
    s.store.set(s.currentBoardAtom, boardWith([ROOT_BOARD_ID]))
    s.store.set(s.networkConfigAtom, {
      baseUrl: 'https://api.example.test/',
      authToken: '',
    })
    const boards = [
      {
        id: ROOT_BOARD_ID,
        title: 'Home',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'net-only',
        title: 'Net only',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url)
        if (u.pathname.endsWith('/boards')) {
          return new Response(JSON.stringify(page(boards)), { status: 200 })
        }
        if (u.pathname.endsWith('/nodes') || u.pathname.endsWith('/edges')) {
          return new Response(JSON.stringify(page([])), { status: 200 })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    await expect(s.resolveBoardAccess('net-only')).resolves.toBe('ok')
    expect(s.store.get(s.accessModeAtom)).toBe('network')
    expect(s.store.get(s.boardsAtom).map((b) => b.id)).toContain('net-only')
  })

  it('stays in Local mode when the connection test fails', async () => {
    const s = await freshState()
    s.store.set(s.accessModeAtom, 'local')
    s.store.set(s.currentBoardAtom, boardWith([ROOT_BOARD_ID]))
    s.store.set(s.networkConfigAtom, {
      baseUrl: 'https://api.example.test/',
      authToken: '',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )

    await expect(s.resolveBoardAccess('unknown')).resolves.toBe('not-found')
    expect(s.store.get(s.accessModeAtom)).toBe('local')
  })

  it('is not-found without attempting a connection when no base URL is configured', async () => {
    const s = await freshState()
    s.store.set(s.accessModeAtom, 'local')
    s.store.set(s.currentBoardAtom, boardWith([ROOT_BOARD_ID]))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(s.resolveBoardAccess('unknown')).resolves.toBe('not-found')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is not-found, without switching modes, when a board exists in neither', async () => {
    const s = await freshState()
    s.writeBoard(boardWith([ROOT_BOARD_ID]))
    s.store.set(s.accessModeAtom, 'network')
    s.store.set(s.currentBoardAtom, boardWith([ROOT_BOARD_ID]))

    await expect(s.resolveBoardAccess('nowhere')).resolves.toBe('not-found')
    expect(s.store.get(s.accessModeAtom)).toBe('network')
  })
})
