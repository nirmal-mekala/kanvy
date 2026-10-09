import { afterEach, describe, expect, it, vi } from 'vitest'
import * as imageFile from '../cards/imageFile'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import type { Op } from '../state/ops'
import { applyOpsToNetwork } from './networkOps'

const config: NetworkConfig = {
  baseUrl: 'http://localhost:1996',
  authToken: '',
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
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

  it('maps an ImageOp with an undefined `after` to a DELETE /images/:id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const op: Op = {
      kind: 'image',
      id: 'img1',
      before: 'data:old',
      after: undefined,
    }
    await applyOpsToNetwork(config, [op], 'do', fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/images/img1')
    expect(init.method).toBe('DELETE')
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

  it('throws when a REST call fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 } as Response)
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

    it("does not resolve an UpdateOp's target id across separate applyOpsToNetwork calls — the id-remap table is batch-scoped now (ctx/notes/260925-network-id-reconciliation.md): a later gesture is expected to already read the confirmed id from live app state (reconciled by state/networkReconcile.ts), not from ops built with a stale one", async () => {
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
