import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as imageFile from '../cards/imageFile'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import type { Op } from '../state/ops'
import { applyOpsToNetwork, resetIdRemapTable } from './networkOps'

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

beforeEach(() => {
  resetIdRemapTable()
})

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
    await applyOpsToNetwork(config, [op], fetchImpl)
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
    await applyOpsToNetwork(config, [op], fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/boards/b1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'new' })
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
    await applyOpsToNetwork(config, [op], fetchImpl)
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
    await applyOpsToNetwork(config, [op], fetchImpl)
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
    await applyOpsToNetwork(config, [op], fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/images/img1')
    expect(init.method).toBe('DELETE')
  })

  it('skips ReorderOp/ReplaceBoardOp — no REST mapping (design doc §5/§10)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    const ops: Op[] = [
      { kind: 'reorder', boardId: 'root', before: [], after: [] },
      {
        kind: 'replace-board',
        before: {} as never,
        after: {} as never,
      },
    ]
    await applyOpsToNetwork(config, ops, fetchImpl)
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
    await applyOpsToNetwork(config, ops, fetchImpl)
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
    await applyOpsToNetwork(config, [op], fetchImpl)
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
    await expect(applyOpsToNetwork(config, [op], fetchImpl)).rejects.toThrow(
      /500/,
    )
  })

  describe('id remap (json-server assigns its own id on create — networkIdRemap.ts)', () => {
    it("resolves a later UpdateOp's target id to the id the server actually assigned on create", async () => {
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
      await applyOpsToNetwork(config, ops, fetchImpl)
      const [patchUrl] = fetchImpl.mock.calls[1] as [string, RequestInit]
      expect(patchUrl).toBe('http://localhost:1996/nodes/server-n1')
    })

    it("resolves an UpdateOp's target id across separate applyOpsToNetwork calls (a later gesture referencing an earlier one's created entity)", async () => {
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
        patchFetch,
      )
      const [patchUrl] = patchFetch.mock.calls[0] as [string, RequestInit]
      expect(patchUrl).toBe('http://localhost:1996/boards/server-b1')
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
            kind: 'image',
            imageId: 'client-img',
          } as never,
        },
      ]
      await applyOpsToNetwork(config, ops, fetchImpl)
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
            kind: 'board',
            boardRef: 'client-board',
          } as never,
        },
      ]
      await applyOpsToNetwork(config, ops, fetchImpl)
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
      await applyOpsToNetwork(config, ops, fetchImpl)
      const [, edgeInit] = fetchImpl.mock.calls[2] as [string, RequestInit]
      expect(JSON.parse(edgeInit.body as string)).toMatchObject({
        fromNodeId: 'server-a',
        toNodeId: 'server-b',
      })
    })
  })
})
