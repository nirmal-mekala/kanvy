import { afterEach, describe, expect, it, vi } from 'vitest'
import * as imageFile from '../cards/imageFile'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import type { Op } from '../state/ops'
import { createIdRemapTable } from './networkIdRemap'
import { applyOpsToNetwork } from './networkOps'

const config: NetworkConfig = {
  baseUrl: 'http://localhost:1996',
  authToken: '',
  dialectId: 'json-server',
}

/** A re-readable stand-in for a JSON `Response` — several tests resolve every call with the same one. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response
}

describe('applyOpsToNetwork', () => {
  it("maps a CreateOp to a POST against the entity's collection, without the client's own id (the server assigns its own — see networkIdRemap.ts)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'server-n1' }))
    const op: Op = {
      kind: 'create',
      entity: 'node',
      value: { id: 'client-n1', x: 1 } as never,
    }
    await applyOpsToNetwork(config, [op], 'do', fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/nodes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ x: 1 })
  })

  it("maps an UpdateOp to a PATCH against the entity's id, sending only `after`", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const op: Op = {
      kind: 'update',
      entity: 'board',
      id: 'b1',
      before: { title: 'old' },
      after: { title: 'new' },
    }
    await applyOpsToNetwork(config, [op], 'do', fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/boards/b1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'new' })
  })

  it('sends a field the patch removes (`undefined`) as an explicit null, so the server blanks it out (schema v7)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const op: Op = {
      kind: 'update',
      entity: 'node',
      id: 'n1',
      before: { cardType: 'link', linkUrl: 'https://x', size: undefined },
      after: { cardType: 'text', linkUrl: undefined, size: 'regular' },
    }
    await applyOpsToNetwork(config, [op], 'do', fetchImpl)
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      cardType: 'text',
      linkUrl: null,
      size: 'regular',
    })
  })

  it('maps an ImageOp with no `before` to a POST /images create, without an id', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'server-img' }))
    const op: Op = {
      kind: 'image',
      id: 'client-img',
      before: undefined,
      after: 'data:x',
    }
    await applyOpsToNetwork(config, [op], 'do', fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/images')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ dataUri: 'data:x' })
  })

  it('maps an ImageOp with an existing `before` to a PATCH /images/:id update', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const op: Op = {
      kind: 'image',
      id: 'img1',
      before: 'data:old',
      after: 'data:new',
    }
    await applyOpsToNetwork(config, [op], 'do', fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/images/img1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ dataUri: 'data:new' })
  })

  it('never DELETEs an image for an ImageOp with an undefined `after` — only the network reaper deletes images, after a server-side reference check', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const op: Op = {
      kind: 'image',
      id: 'img1',
      before: 'data:old',
      after: undefined,
    }
    await applyOpsToNetwork(config, [op], 'do', fetchImpl)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('skips ReplaceBoardOp — no REST mapping (design doc §10)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const ops: Op[] = [
      {
        kind: 'replace-board',
        before: {} as never,
        after: {} as never,
      },
    ]
    await applyOpsToNetwork(config, ops, 'do', fetchImpl)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('applies multiple ops in order, sequentially', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      calls.push(url)
      return jsonResponse({ id: 'server-id' })
    })
    const ops: Op[] = [
      { kind: 'create', entity: 'node', value: { id: 'n1' } as never },
      { kind: 'create', entity: 'edge', value: { id: 'e1' } as never },
    ]
    await applyOpsToNetwork(config, ops, 'do', fetchImpl)
    expect(calls).toEqual([
      'http://localhost:1996/nodes',
      'http://localhost:1996/edges',
    ])
  })

  it("routes an ImageOp's `after` through ensureDataUriUnderBytes before POSTing (json-server's ~100KB body limit)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'server-img' }))
    const spy = vi
      .spyOn(imageFile, 'ensureDataUriUnderBytes')
      .mockResolvedValue('data:downsized')
    const op: Op = {
      kind: 'image',
      id: 'img1',
      before: undefined,
      after: 'data:big',
    }
    await applyOpsToNetwork(config, [op], 'do', fetchImpl)
    expect(spy).toHaveBeenCalledWith('data:big', expect.any(Number))
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      dataUri: 'data:downsized',
    })
    spy.mockRestore()
  })

  it("leaves an image alone on a dialect with no per-request size limit (PostgREST), sending it in that dialect's field names", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'server-img', data_uri: 'x' }))
    const spy = vi.spyOn(imageFile, 'ensureDataUriUnderBytes')
    const op: Op = {
      kind: 'image',
      id: 'img1',
      before: undefined,
      after: 'data:big',
    }
    await applyOpsToNetwork(
      { ...config, dialectId: 'postgrest' },
      [op],
      'do',
      fetchImpl,
    )
    expect(spy).not.toHaveBeenCalled()
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ data_uri: 'data:big' })
    spy.mockRestore()
  })

  it('throws when a REST call fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500))
    const op: Op = {
      kind: 'create',
      entity: 'node',
      value: { id: 'n1' } as never,
    }
    await expect(
      applyOpsToNetwork(config, [op], 'do', fetchImpl),
    ).rejects.toThrow(/500/)
  })

  describe('id remap (json-server assigns its own id on create — networkIdRemap.ts, batch-scoped)', () => {
    it("resolves a later UpdateOp's target id to the id the server actually assigned on create, within the same batch", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'server-n1' }))
        .mockResolvedValueOnce(jsonResponse({}))
      const ops: Op[] = [
        { kind: 'create', entity: 'node', value: { id: 'client-n1' } as never },
        {
          kind: 'update',
          entity: 'node',
          id: 'client-n1',
          before: { x: 0 },
          after: { x: 5 },
        },
      ]
      await applyOpsToNetwork(config, ops, 'do', fetchImpl)
      const [patchUrl] = fetchImpl.mock.calls[1] as [string, RequestInit]
      expect(patchUrl).toBe('http://localhost:1996/nodes/server-n1')
    })

    it("resolves a later batch's UpdateOp through a shared table — an edit built under the client id while the create was still in flight (ctx/notes/261029-edits-to-unconfirmed-creates.md)", async () => {
      const table = createIdRemapTable()
      const createFetch = vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: 'server-b1' }))
      await applyOpsToNetwork(
        config,
        [
          {
            kind: 'create',
            entity: 'board',
            value: { id: 'client-b1' } as never,
          },
        ],
        'do',
        createFetch,
        table,
      )

      const patchFetch = vi.fn().mockResolvedValue(jsonResponse({}))
      await applyOpsToNetwork(
        config,
        [
          {
            kind: 'update',
            entity: 'board',
            id: 'client-b1',
            before: { title: 'old' },
            after: { title: 'new' },
          },
        ],
        'do',
        patchFetch,
        table,
      )
      const [patchUrl] = patchFetch.mock.calls[0] as [string, RequestInit]
      expect(patchUrl).toBe('http://localhost:1996/boards/server-b1')
    })

    it("resolves a later batch's create references (an edge to a node created in an earlier batch) through a shared table", async () => {
      const table = createIdRemapTable()
      await applyOpsToNetwork(
        config,
        [
          {
            kind: 'create',
            entity: 'node',
            value: { id: 'client-n1' } as never,
          },
        ],
        'do',
        vi.fn().mockResolvedValue(jsonResponse({ id: 'server-n1' })),
        table,
      )
      const edgeFetch = vi.fn().mockResolvedValue(jsonResponse({ id: 'e' }))
      await applyOpsToNetwork(
        config,
        [
          {
            kind: 'create',
            entity: 'edge',
            value: {
              id: 'client-e1',
              fromNodeId: 'client-n1',
              toNodeId: 'other',
            } as never,
          },
        ],
        'do',
        edgeFetch,
        table,
      )
      const [, init] = edgeFetch.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(init.body as string)).toMatchObject({
        fromNodeId: 'server-n1',
      })
    })

    it('retrying a batch that failed partway never re-POSTs a create that already went through', async () => {
      const table = createIdRemapTable()
      const ops: Op[] = [
        { kind: 'create', entity: 'node', value: { id: 'client-n1' } as never },
        {
          kind: 'image',
          id: 'client-img',
          before: undefined,
          after: 'data:x',
        },
        {
          kind: 'update',
          entity: 'node',
          id: 'client-n1',
          before: { x: 0 },
          after: { x: 5 },
        },
      ]
      const firstTry = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'server-n1' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'server-img' }))
        .mockResolvedValueOnce(jsonResponse({}, 500))
      await expect(
        applyOpsToNetwork(config, ops, 'do', firstTry, table),
      ).rejects.toThrow(/500/)

      const retry = vi.fn().mockResolvedValue(jsonResponse({}))
      await applyOpsToNetwork(config, ops, 'do', retry, table)
      expect(
        retry.mock.calls.map(([url, init]) => [
          (init as RequestInit).method,
          url,
        ]),
      ).toEqual([['PATCH', 'http://localhost:1996/nodes/server-n1']])
    })

    it('counts a create as confirmed even when the server kept the client id', async () => {
      const table = createIdRemapTable()
      const op: Op = {
        kind: 'create',
        entity: 'node',
        value: { id: 'n1' } as never,
      }
      await applyOpsToNetwork(
        config,
        [op],
        'do',
        vi.fn().mockResolvedValue(jsonResponse({ id: 'n1' })),
        table,
      )
      const retry = vi.fn().mockResolvedValue(jsonResponse({ id: 'n1' }))
      await applyOpsToNetwork(config, [op], 'do', retry, table)
      expect(retry).not.toHaveBeenCalled()
    })

    it('defaults to a fresh table per call, so a call without one shares nothing with an earlier call', async () => {
      await applyOpsToNetwork(
        config,
        [
          {
            kind: 'create',
            entity: 'board',
            value: { id: 'client-b1' } as never,
          },
        ],
        'do',
        vi.fn().mockResolvedValue(jsonResponse({ id: 'server-b1' })),
      )
      const patchFetch = vi.fn().mockResolvedValue(jsonResponse({}))
      await applyOpsToNetwork(
        config,
        [
          {
            kind: 'update',
            entity: 'board',
            id: 'client-b1',
            before: { title: 'old' },
            after: { title: 'new' },
          },
        ],
        'do',
        patchFetch,
      )
      const [patchUrl] = patchFetch.mock.calls[0] as [string, RequestInit]
      expect(patchUrl).toBe('http://localhost:1996/boards/client-b1')
    })

    it("resolves a node create's `boardId` against a board created earlier in the same batch (the reported bug: a node created right after its board, in the same gesture)", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'server-board' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'server-node' }))
      const ops: Op[] = [
        {
          kind: 'create',
          entity: 'board',
          value: { id: 'client-board' } as never,
        },
        {
          kind: 'create',
          entity: 'node',
          value: { id: 'client-node', boardId: 'client-board' } as never,
        },
      ]
      await applyOpsToNetwork(config, ops, 'do', fetchImpl)
      const [, nodeInit] = fetchImpl.mock.calls[1] as [string, RequestInit]
      expect(JSON.parse(nodeInit.body as string)).toMatchObject({
        boardId: 'server-board',
      })
    })

    it("resolves a node create's `imageId` against an image created earlier in the same batch", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'server-img' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'server-node' }))
      const ops: Op[] = [
        { kind: 'image', id: 'client-img', before: undefined, after: 'data:x' },
        {
          kind: 'create',
          entity: 'node',
          value: {
            id: 'client-node',
            cardType: 'image',
            imageId: 'client-img',
          } as never,
        },
      ]
      await applyOpsToNetwork(config, ops, 'do', fetchImpl)
      const [, nodeInit] = fetchImpl.mock.calls[1] as [string, RequestInit]
      expect(JSON.parse(nodeInit.body as string)).toMatchObject({
        imageId: 'server-img',
      })
    })

    it("resolves a node create's `boardRef` against a board created earlier in the same batch", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'server-board' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'server-node' }))
      const ops: Op[] = [
        {
          kind: 'create',
          entity: 'board',
          value: { id: 'client-board' } as never,
        },
        {
          kind: 'create',
          entity: 'node',
          value: {
            id: 'client-node',
            cardType: 'board',
            boardRef: 'client-board',
          } as never,
        },
      ]
      await applyOpsToNetwork(config, ops, 'do', fetchImpl)
      const [, nodeInit] = fetchImpl.mock.calls[1] as [string, RequestInit]
      expect(JSON.parse(nodeInit.body as string)).toMatchObject({
        boardRef: 'server-board',
      })
    })

    it("resolves an edge create's `fromNodeId`/`toNodeId` against nodes created earlier in the same batch", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ id: 'server-a' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'server-b' }))
        .mockResolvedValueOnce(jsonResponse({ id: 'server-edge' }))
      const ops: Op[] = [
        { kind: 'create', entity: 'node', value: { id: 'client-a' } as never },
        { kind: 'create', entity: 'node', value: { id: 'client-b' } as never },
        {
          kind: 'create',
          entity: 'edge',
          value: {
            id: 'client-edge',
            fromNodeId: 'client-a',
            toNodeId: 'client-b',
          } as never,
        },
      ]
      await applyOpsToNetwork(config, ops, 'do', fetchImpl)
      const [, edgeInit] = fetchImpl.mock.calls[2] as [string, RequestInit]
      expect(JSON.parse(edgeInit.body as string)).toMatchObject({
        fromNodeId: 'server-a',
        toNodeId: 'server-b',
      })
    })
  })
})

describe('applyOpsToNetwork — undo/redo replay (ctx/notes/261008-network-undo-redo.md)', () => {
  function requests(fetchImpl: ReturnType<typeof vi.fn>) {
    return fetchImpl.mock.calls.map(([url, init]) => {
      const { method, body } = init as RequestInit
      return {
        method,
        url: url as string,
        body: body === undefined ? undefined : JSON.parse(body as string),
      }
    })
  }

  const createNode: Op = {
    kind: 'create',
    entity: 'node',
    value: {
      id: 'n1',
      x: 1,
      status: 'active',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as never,
  }

  it('undoes an update by PATCHing its `before`, blanking fields the original update added with an explicit null', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const op: Op = {
      kind: 'update',
      entity: 'node',
      id: 'n1',
      before: { cardType: 'text', size: 'regular', linkUrl: undefined },
      after: { cardType: 'link', size: undefined, linkUrl: 'https://x' },
    }
    await applyOpsToNetwork(config, [op], 'undo', fetchImpl)
    expect(requests(fetchImpl)).toEqual([
      {
        method: 'PATCH',
        url: 'http://localhost:1996/nodes/n1',
        body: { cardType: 'text', size: 'regular', linkUrl: null },
      },
    ])
  })

  it('redoes an update by PATCHing its `after`', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const op: Op = {
      kind: 'update',
      entity: 'board',
      id: 'b1',
      before: { title: 'old' },
      after: { title: 'new' },
    }
    await applyOpsToNetwork(config, [op], 'redo', fetchImpl)
    expect(requests(fetchImpl)[0]?.body).toEqual({ title: 'new' })
  })

  describe('a replayed create is a status PATCH against the existing entity — never a POST or DELETE', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('undo trashes it, stamping `updatedAt` with the tombstone time (the network reaper ages by it)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'))
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
      await applyOpsToNetwork(config, [createNode], 'undo', fetchImpl)
      expect(requests(fetchImpl)).toEqual([
        {
          method: 'PATCH',
          url: 'http://localhost:1996/nodes/n1',
          body: { status: 'trashed', updatedAt: '2026-10-09T12:00:00.000Z' },
        },
      ])
    })

    it("redo reactivates it, restoring the create's original `updatedAt` (local redo re-appends `op.value` unchanged)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
      await applyOpsToNetwork(config, [createNode], 'redo', fetchImpl)
      expect(requests(fetchImpl)).toEqual([
        {
          method: 'PATCH',
          url: 'http://localhost:1996/nodes/n1',
          body: { status: 'active', updatedAt: '2026-01-01T00:00:00.000Z' },
        },
      ])
    })
  })

  it('undoes a batch in reverse order (like applyOps(…, "before") locally)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const ops: Op[] = [
      { kind: 'create', entity: 'board', value: { id: 'b1' } as never },
      createNode,
    ]
    await applyOpsToNetwork(config, ops, 'undo', fetchImpl)
    expect(requests(fetchImpl).map((r) => r.url)).toEqual([
      'http://localhost:1996/nodes/n1',
      'http://localhost:1996/boards/b1',
    ])
  })

  describe('image ops (no status field)', () => {
    const createImage: Op = {
      kind: 'image',
      id: 'img1',
      before: undefined,
      after: 'data:x',
    }

    it.each(['undo', 'redo'] as const)(
      'sends nothing on %s of an image create — the row stays on the server until the reaper deletes it with its last referencing node',
      async (replay) => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
        await applyOpsToNetwork(config, [createImage], replay, fetchImpl)
        expect(fetchImpl).not.toHaveBeenCalled()
      },
    )

    it("undoing an image paste only tombstones the node — the image itself isn't DELETEd", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
      const createImageCard: Op = {
        kind: 'create',
        entity: 'node',
        value: {
          id: 'n1',
          imageId: 'img1',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as never,
      }
      await applyOpsToNetwork(
        config,
        [createImage, createImageCard],
        'undo',
        fetchImpl,
      )
      expect(requests(fetchImpl).map((r) => [r.method, r.url])).toEqual([
        ['PATCH', 'http://localhost:1996/nodes/n1'],
      ])
    })

    it('undoes an image update by PATCHing back its `before`', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
      const op: Op = {
        kind: 'image',
        id: 'img1',
        before: 'data:old',
        after: 'data:new',
      }
      await applyOpsToNetwork(config, [op], 'undo', fetchImpl)
      expect(requests(fetchImpl)).toEqual([
        {
          method: 'PATCH',
          url: 'http://localhost:1996/images/img1',
          body: { dataUri: 'data:old' },
        },
      ])
    })
  })
})
