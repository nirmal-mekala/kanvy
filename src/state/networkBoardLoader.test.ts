import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../schema/board'
import { mergeBoardContent, withoutReapedEntities } from './networkBoardLoader'

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

const ts = '2026-01-01T00:00:00.000Z'

/** A `GET /boards` entry as a v6+ backend stores it. */
function serverBoard(id: string, isRoot: boolean) {
  return {
    id,
    title: id,
    status: 'active',
    isRoot,
    createdAt: ts,
    updatedAt: ts,
  }
}

/** A `fetch` stub serving `boards` for `/boards`, `nodes` for `/nodes`, and nothing for `/edges`. */
function stubServer(boards: unknown[], nodes: unknown[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.pathname.endsWith('/boards')) {
        return new Response(JSON.stringify(page(boards)), { status: 200 })
      }
      if (u.pathname.endsWith('/nodes')) {
        return new Response(JSON.stringify(page(nodes)), { status: 200 })
      }
      if (u.pathname.endsWith('/edges')) {
        return new Response(JSON.stringify(page([])), { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }),
  )
}

const CONFIG = { baseUrl: 'https://api.example.test/', authToken: '' }

function emptyBoard(): Board {
  return {
    version: 7,
    nodes: [],
    edges: [],
    boards: [
      {
        id: 'h0me0b0ard00',
        title: 'Home',
        status: 'active',
        isRoot: true,
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

describe('withoutReapedEntities', () => {
  it('drops reaped ids per kind, leaving same-id entities of other kinds alone', () => {
    const board: Board = {
      ...emptyBoard(),
      nodes: [{ id: 'n1' } as never, { id: 'x' } as never],
      edges: [{ id: 'e1' } as never],
      images: [{ id: 'img1', dataUri: 'data:x' }],
    }
    const result = withoutReapedEntities(board, {
      nodeIds: new Set(['n1']),
      edgeIds: new Set(['x', 'e1']),
      boardIds: new Set(['h0me0b0ard00']),
      imageIds: new Set(['img1']),
    })
    expect(result.nodes).toEqual([{ id: 'x' }])
    expect(result.edges).toEqual([])
    expect(result.boards).toEqual([])
    expect(result.images).toEqual([])
  })

  it('returns the same board when nothing was reaped', () => {
    const board = emptyBoard()
    const none = new Set<string>()
    expect(
      withoutReapedEntities(board, {
        nodeIds: none,
        edgeIds: none,
        boardIds: none,
        imageIds: none,
      }),
    ).toBe(board)
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
  const { attemptBootReconnect, networkLoadErrorAtom } = await import(
    './networkBoardLoader'
  )
  const { rootBoardIdAtom } = await import('./atoms/currentBoard')
  const { switchToLocalMode } = await import('./networkBoardLoader')
  const { currentBoardAtom } = await import('./history/liveBoard')
  return {
    store: getDefaultStore(),
    switchToLocalMode,
    currentBoardAtom,
    accessModeAtom,
    attemptBootReconnect,
    networkLoadErrorAtom,
    rootBoardIdAtom,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('attemptBootReconnect', () => {
  it("switches to Network mode on a successful connection, homing on the server's isRoot board", async () => {
    const s = await freshState()
    stubServer([serverBoard('s3rv3rr00t00', true), serverBoard('b1', false)])

    const result = await s.attemptBootReconnect(CONFIG)

    expect(result).toBe('connected')
    expect(s.store.get(s.accessModeAtom)).toBe('network')
    expect(s.store.get(s.rootBoardIdAtom)).toBe('s3rv3rr00t00')
  })

  it('fails, naming the board and field, when a server board predates isRoot', async () => {
    const s = await freshState()
    const { isRoot: _isRoot, ...legacyRoot } = serverBoard('root', true)
    stubServer([legacyRoot])

    const result = await s.attemptBootReconnect(CONFIG)

    expect(result).toBe('failed')
    expect(s.store.get(s.networkLoadErrorAtom)?.message).toMatch(
      /GET \/boards returned 1 invalid entry: id "root" \(isRoot: /,
    )
  })

  it('fails, naming the nodes, when a home-board node uses a pre-v7 shape: task { status } or null, or index instead of position', async () => {
    const s = await freshState()
    const node = (id: string, fields: Record<string, unknown>) => ({
      id,
      boardId: 's3rv3rr00t00',
      nodeType: 'container',
      pattern: 'none',
      x: 0,
      y: 0,
      w: 128,
      h: 96,
      color: 'gray',
      status: 'active',
      createdAt: ts,
      updatedAt: ts,
      ...fields,
    })
    const v7 = { task: 'none', position: 0 }
    stubServer(
      [serverBoard('s3rv3rr00t00', true)],
      [
        node('ok', { ...v7, task: 'done' }),
        node('not-a-task', v7),
        node('old', { ...v7, task: { status: 'done' } }),
        node('nulled', { ...v7, task: null }),
        node('indexed', { task: 'none', index: 0 }),
      ],
    )

    expect(await s.attemptBootReconnect(CONFIG)).toBe('failed')
    expect(s.store.get(s.networkLoadErrorAtom)?.message).toMatch(
      /GET \/nodes returned 3 invalid entries: id "old" \(.*\); id "nulled" \(.*\); id "indexed" \(/,
    )
  })

  it('fails when the server has no root board (including an empty boards collection)', async () => {
    const s = await freshState()
    stubServer([])

    expect(await s.attemptBootReconnect(CONFIG)).toBe('failed')
    expect(s.store.get(s.networkLoadErrorAtom)?.message).toMatch(
      /GET \/boards: no board has isRoot: true/,
    )
  })

  it('fails when the server marks more than one board as root, rather than picking one', async () => {
    const s = await freshState()
    stubServer([serverBoard('r1', true), serverBoard('r2', true)])

    expect(await s.attemptBootReconnect(CONFIG)).toBe('failed')
    expect(s.store.get(s.networkLoadErrorAtom)?.message).toMatch(
      /2 boards have isRoot: true \("r1", "r2"\)/,
    )
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

describe('background network reap after network init', () => {
  const aged = '2020-01-01T00:00:00.000Z'
  const homeNode = (id: string, status: string) => ({
    id,
    boardId: 'h',
    nodeType: 'container',
    pattern: 'none',
    x: 0,
    y: 0,
    w: 128,
    h: 96,
    color: 'gray',
    task: 'none',
    position: 0,
    status,
    createdAt: aged,
    updatedAt: aged,
  })

  /** Honors `field=value` filters and DELETE, unlike `stubServer`. */
  function stubFilteringServer(nodes: Record<string, unknown>[]) {
    const deletes: string[] = []
    const db: Record<string, Record<string, unknown>[]> = {
      boards: [serverBoard('h', true)],
      nodes,
      edges: [],
      images: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = new URL(url)
        const [collection = '', id] = u.pathname.slice(1).split('/')
        if (init?.method === 'DELETE') {
          deletes.push(`${collection}/${id}`)
          db[collection] = (db[collection] ?? []).filter((r) => r.id !== id)
          return new Response('{}', { status: 200 })
        }
        const rows = (db[collection] ?? []).filter((row) =>
          [...u.searchParams].every(
            ([key, value]) =>
              key.startsWith('_') ||
              (key.endsWith(':in')
                ? value.split(',').includes(String(row[key.slice(0, -3)]))
                : String(row[key]) === value),
          ),
        )
        return new Response(JSON.stringify(page(rows)), { status: 200 })
      }),
    )
    return deletes
  }

  it('hard-deletes an aged, trashed node on the server and drops it from the live document', async () => {
    const s = await freshState()
    const deletes = stubFilteringServer([
      homeNode('live', 'active'),
      homeNode('old', 'trashed'),
    ])

    expect(await s.attemptBootReconnect(CONFIG)).toBe('connected')

    await vi.waitFor(() => expect(deletes).toEqual(['nodes/old']))
    await vi.waitFor(() =>
      expect(s.store.get(s.currentBoardAtom).nodes.map((n) => n.id)).toEqual([
        'live',
      ]),
    )
  })

  it('stops, deleting nothing, when the user switches back to local mode first', async () => {
    const s = await freshState()
    const deletes = stubFilteringServer([homeNode('old', 'trashed')])
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await s.attemptBootReconnect(CONFIG)).toBe('connected')
    s.switchToLocalMode()
    s.store.set(s.accessModeAtom, 'local')

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(deletes).toEqual([])
  })
})
