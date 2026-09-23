import { describe, expect, it, vi } from 'vitest'
import type { NetworkConfig } from '../state/atoms/networkSettings'
import type { Op } from '../state/ops'
import { applyOpsToNetwork } from './networkOps'

const config: NetworkConfig = {
  baseUrl: 'http://localhost:1996',
  authToken: '',
}

function okResponse(): Response {
  return { ok: true, status: 200, json: () => Promise.resolve({}) } as Response
}

describe('applyOpsToNetwork', () => {
  it("maps a CreateOp to a POST against the entity's collection", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const op: Op = {
      kind: 'create',
      entity: 'node',
      value: { id: 'n1' } as never,
    }
    await applyOpsToNetwork(config, [op], fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/nodes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ id: 'n1' })
  })

  it("maps an UpdateOp to a PATCH against the entity's id, sending only `after`", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
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

  it('maps an ImageOp with no `before` to a POST /images create', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const op: Op = {
      kind: 'image',
      id: 'img1',
      before: undefined,
      after: 'data:x',
    }
    await applyOpsToNetwork(config, [op], fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:1996/images')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      id: 'img1',
      dataUri: 'data:x',
    })
  })

  it('maps an ImageOp with an existing `before` to a PATCH /images/:id update', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
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
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
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
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
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
      return okResponse()
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
})
