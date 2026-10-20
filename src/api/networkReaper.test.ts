import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REAP_AGE_MS } from '../state/reaper'
import { runNetworkReap } from './networkReaper'

const config = {
  baseUrl: 'http://localhost:1996',
  authToken: '',
  dialectId: 'json-server',
}
const NOW = new Date('2026-10-09T00:00:00.000Z').getTime()
const AGED = new Date(NOW - REAP_AGE_MS - 1000).toISOString()

type Row = Record<string, unknown> & { id: string }
type Db = Record<string, Row[]>

function card(
  id: string,
  boardId: string,
  status: string,
  fields: Record<string, unknown> = { cardType: 'text', size: 'regular' },
): Row {
  return {
    id,
    boardId,
    nodeType: 'card',
    content: '',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    task: 'none',
    status,
    position: 0,
    createdAt: AGED,
    updatedAt: AGED,
    ...fields,
  }
}

function edge(
  id: string,
  boardId: string,
  status: string,
  from: string,
  to: string,
): Row {
  return {
    id,
    boardId,
    fromNodeId: from,
    fromSide: 'right',
    toNodeId: to,
    toSide: 'left',
    direction: 'none',
    status,
    createdAt: AGED,
    updatedAt: AGED,
  }
}

function board(id: string, status: string, isRoot = false): Row {
  return { id, title: id, status, isRoot, createdAt: AGED, updatedAt: AGED }
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, value] of params) {
    if (key.startsWith('_')) continue
    if (key.endsWith(':in')) {
      if (!value.split(',').includes(String(row[key.slice(0, -3)]))) {
        return false
      }
    } else if (key.endsWith(':lt')) {
      if (!(String(row[key.slice(0, -3)]) < value)) return false
    } else if (String(row[key]) !== value) {
      return false
    }
  }
  return true
}

/**
 * A json-server-shaped fake: `field=value` / `field:in=a,b` / `field:lt=v`
 * filters, paginated GETs, DELETE by id; `failDeletes` answer 500.
 * `beforeDelete` runs before each DELETE, to change the db mid-run (as
 * another client could).
 */
function fakeServer(
  db: Db,
  failDeletes: string[] = [],
  beforeDelete: (path: string) => void = () => {},
) {
  const deletes: string[] = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url)
    const [collection, id] = u.pathname.slice(1).split('/') as [string, string?]
    if (init?.method === 'DELETE') {
      const path = `${collection}/${id}`
      beforeDelete(path)
      const rows = db[collection] ?? []
      if (failDeletes.includes(path)) return new Response('', { status: 500 })
      deletes.push(path)
      db[collection] = rows.filter((row) => row.id !== id)
      return new Response('{}', { status: 200 })
    }
    const data = (db[collection] ?? []).filter((row) =>
      matches(row, u.searchParams),
    )
    return new Response(
      JSON.stringify({
        first: 1,
        prev: null,
        next: null,
        last: 1,
        pages: 1,
        items: data.length,
        data,
      }),
      { status: 200 },
    )
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, deletes }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runNetworkReap', () => {
  it('deletes standalone tombstones, then board content (edges before nodes), then boards, then orphaned images — and leaves live content alone', async () => {
    const db: Db = {
      boards: [board('h', 'active', true), board('b1', 'trashed')],
      nodes: [
        card('live', 'h', 'active'),
        card('bc', 'h', 'trashed', { cardType: 'board', boardRef: 'b1' }),
        card('on-b1', 'b1', 'active', { cardType: 'image', imageId: 'img1' }),
      ],
      edges: [edge('e1', 'b1', 'active', 'on-b1', 'on-b1')],
      images: [{ id: 'img1', dataUri: 'data:x' }],
    }
    const { fetchImpl, deletes } = fakeServer(db)
    const result = await runNetworkReap(config, NOW, { fetchImpl })
    expect(deletes).toEqual([
      'nodes/bc',
      'edges/e1',
      'nodes/on-b1',
      'boards/b1',
      'images/img1',
    ])
    expect(db.nodes?.map((n) => n.id)).toEqual(['live'])
    expect(result.boardIds).toEqual(new Set(['b1']))
    expect(result.imageIds).toEqual(new Set(['img1']))
  })

  it('keeps an image another node still references, even on another board', async () => {
    const db: Db = {
      boards: [board('h', 'active', true), board('other', 'active')],
      nodes: [
        card('gone', 'h', 'trashed', { cardType: 'image', imageId: 'shared' }),
        card('copy', 'other', 'active', {
          cardType: 'image',
          imageId: 'shared',
        }),
      ],
      edges: [],
      images: [{ id: 'shared', dataUri: 'data:x' }],
    }
    const { fetchImpl, deletes } = fakeServer(db)
    await runNetworkReap(config, NOW, { fetchImpl })
    expect(deletes).toEqual(['nodes/gone'])
    expect(db.images).toHaveLength(1)
  })

  it('skips everything that depends on a failed delete, but carries on with the rest', async () => {
    const db: Db = {
      boards: [board('h', 'active', true), board('b1', 'trashed')],
      nodes: [
        card('a', 'b1', 'active', { cardType: 'image', imageId: 'img-a' }),
        card('b', 'b1', 'active'),
        card('solo', 'h', 'trashed', { cardType: 'image', imageId: 'img-s' }),
      ],
      edges: [edge('e1', 'b1', 'active', 'a', 'b')],
      images: [
        { id: 'img-a', dataUri: 'data:a' },
        { id: 'img-s', dataUri: 'data:s' },
      ],
    }
    const { fetchImpl, deletes } = fakeServer(db, ['edges/e1'])
    const result = await runNetworkReap(config, NOW, { fetchImpl })
    // e1 failed: a and b (its endpoints) and so b1 are skipped, along with
    // a's image; the unrelated trashed node and its image still go.
    expect(deletes).toEqual(['nodes/solo', 'images/img-s'])
    expect(result.boardIds.size).toBe(0)
    expect(console.warn).toHaveBeenCalled()
  })

  describe('guards against changes made after planning (ctx/notes/261020-safe-network-deletes.md)', () => {
    it("leaves a board's content alone when the board is restored before its content is reached", async () => {
      const db: Db = {
        boards: [board('h', 'active', true), board('b1', 'trashed')],
        nodes: [
          card('solo', 'h', 'trashed'),
          card('bc', 'h', 'trashed', { cardType: 'board', boardRef: 'b1' }),
          card('on-b1', 'b1', 'active'),
        ],
        edges: [],
        images: [],
      }
      const { fetchImpl, deletes } = fakeServer(db, [], (path) => {
        // Another client undoes the board's deletion mid-run.
        if (path === 'nodes/solo') {
          const b1 = db.boards?.find((b) => b.id === 'b1')
          if (b1) b1.status = 'active'
        }
      })
      const result = await runNetworkReap(config, NOW, { fetchImpl })
      expect(deletes).toEqual(['nodes/solo', 'nodes/bc'])
      expect(db.nodes?.map((n) => n.id)).toEqual(['on-b1'])
      expect(result.boardIds.size).toBe(0)
    })

    it('skips a board something new was added to, rather than letting ON DELETE CASCADE take it', async () => {
      const db: Db = {
        boards: [board('h', 'active', true), board('b1', 'trashed')],
        nodes: [card('on-b1', 'b1', 'active')],
        edges: [],
        images: [],
      }
      const { fetchImpl, deletes } = fakeServer(db, [], (path) => {
        if (path === 'nodes/on-b1') db.nodes?.push(card('new', 'b1', 'active'))
      })
      await runNetworkReap(config, NOW, { fetchImpl })
      expect(deletes).toEqual(['nodes/on-b1'])
      expect(db.boards?.map((b) => b.id)).toEqual(['h', 'b1'])
      expect(db.nodes?.map((n) => n.id)).toEqual(['new'])
    })

    it('skips a tombstone that was restored after planning', async () => {
      const db: Db = {
        boards: [board('h', 'active', true)],
        nodes: [card('n1', 'h', 'trashed'), card('n2', 'h', 'trashed')],
        edges: [],
        images: [],
      }
      const { fetchImpl, deletes } = fakeServer(db, [], (path) => {
        if (path === 'nodes/n1') {
          const n2 = db.nodes?.find((n) => n.id === 'n2')
          if (n2) n2.status = 'active'
        }
      })
      await runNetworkReap(config, NOW, { fetchImpl })
      expect(deletes).toEqual(['nodes/n1'])
    })

    it('skips a node an edge created after planning still touches', async () => {
      const db: Db = {
        boards: [board('h', 'active', true)],
        nodes: [card('n1', 'h', 'trashed'), card('live', 'h', 'active')],
        edges: [],
        images: [],
      }
      const { fetchImpl, deletes } = fakeServer(db)
      let touchingReads = 0
      const wrapped = (async (url: string, init?: RequestInit) => {
        // The edge appears between planning (the first touching-edge read)
        // and the pre-delete re-read (the second).
        if (new URL(url).searchParams.has('fromNodeId:in')) {
          touchingReads += 1
          if (touchingReads === 2) {
            db.edges?.push(edge('new', 'h', 'active', 'live', 'n1'))
          }
        }
        return fetchImpl(url, init)
      }) as typeof fetch
      await runNetworkReap(config, NOW, { fetchImpl: wrapped })
      expect(deletes).toEqual([])
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('still touched by edges/new'),
      )
    })
  })

  it('stops issuing requests once shouldContinue turns false, reporting what it already deleted', async () => {
    const db: Db = {
      boards: [board('h', 'active', true)],
      nodes: [card('n1', 'h', 'trashed'), card('n2', 'h', 'trashed')],
      edges: [],
      images: [],
    }
    const { fetchImpl, deletes } = fakeServer(db)
    const result = await runNetworkReap(config, NOW, {
      fetchImpl,
      shouldContinue: () => deletes.length === 0,
    })
    expect(deletes).toEqual(['nodes/n1'])
    expect(result.nodeIds).toEqual(new Set(['n1']))
  })

  it('throws when the candidates themselves can’t be fetched, having deleted nothing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 503 }))
    await expect(runNetworkReap(config, NOW, { fetchImpl })).rejects.toThrow()
    expect(
      fetchImpl.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      ),
    ).toBe(false)
  })
})
