import { createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinkMetadata } from '../../cards/linkMetadata'
import type { Node } from '../../schema/node'

const { fetchLinkMetadataMock } = vi.hoisted(() => ({
  fetchLinkMetadataMock: vi.fn<(url: string) => Promise<LinkMetadata>>(),
}))
vi.mock('../../cards/linkMetadata', () => ({
  fetchLinkMetadata: fetchLinkMetadataMock,
}))

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.get(key) ?? null
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

function linkNode(id: string): Node {
  return {
    id,
    boardId: 'h0me0b0ard00',
    nodeType: 'card',
    cardType: 'link',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    task: 'none',
    status: 'active',
    position: 0,
    content: '',
    linkUrl: 'https://example.com',
    linkTitle: null,
    linkImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** A promise plus its resolve/reject, so a test controls when the fetch settles. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Fresh atom modules per test (same rationale as nodes.test.ts):
// boardHistoryAtom reads localStorage once, at import time.
async function freshState() {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.resetModules()
  const linkFetch = await import('./linkFetch')
  const nodes = await import('./nodes')
  const history = await import('../history/boardHistoryAtom')
  const reconcile = await import('../networkReconcile')
  const store = createStore()
  const pending = (id: string) =>
    linkFetch.isLinkFetchPending(
      store.get(linkFetch.pendingLinkFetchIdsAtom),
      id,
    )
  return { store, pending, ...linkFetch, ...nodes, ...history, ...reconcile }
}

beforeEach(() => {
  fetchLinkMetadataMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchLinkMetadataAtom (in-memory link fetch state, schema v7)', () => {
  it('marks the card pending while the fetch is in flight, then applies the metadata and clears pending', async () => {
    const s = await freshState()
    const fetch = deferred<LinkMetadata>()
    fetchLinkMetadataMock.mockReturnValue(fetch.promise)
    s.store.set(s.addNodeAtom, linkNode('l1'))

    s.store.set(s.fetchLinkMetadataAtom, 'l1', 'https://example.com')
    expect(fetchLinkMetadataMock).toHaveBeenCalledWith('https://example.com')
    expect(s.pending('l1')).toBe(true)

    fetch.resolve({ title: 'Example', imageUrl: null })
    await vi.waitFor(() => expect(s.pending('l1')).toBe(false))
    expect(s.store.get(s.nodeFamily('l1'))).toMatchObject({
      linkTitle: 'Example',
      linkImageUrl: null,
    })
  })

  it('clears pending on a failed fetch, leaving the metadata null', async () => {
    const s = await freshState()
    const fetch = deferred<LinkMetadata>()
    fetchLinkMetadataMock.mockReturnValue(fetch.promise)
    s.store.set(s.addNodeAtom, linkNode('l1'))

    s.store.set(s.fetchLinkMetadataAtom, 'l1', 'https://example.com')
    fetch.reject(new Error('nope'))

    await vi.waitFor(() => expect(s.pending('l1')).toBe(false))
    expect(s.store.get(s.nodeFamily('l1'))).toMatchObject({
      linkTitle: null,
      linkImageUrl: null,
    })
  })

  it('never persists fetch state: the node itself carries no status field', async () => {
    const s = await freshState()
    fetchLinkMetadataMock.mockReturnValue(new Promise(() => {}))
    s.store.set(s.addNodeAtom, linkNode('l1'))
    s.store.set(s.fetchLinkMetadataAtom, 'l1', 'https://example.com')

    const node = s.store.get(s.nodeFamily('l1'))
    expect(node).not.toHaveProperty('status', 'loading')
    expect(node).not.toHaveProperty('link')
  })

  it('still reports pending under the server id once the captured local id is reconciled (network mode)', async () => {
    const s = await freshState()
    fetchLinkMetadataMock.mockReturnValue(new Promise(() => {}))
    s.store.set(s.fetchLinkMetadataAtom, 'local-1', 'https://example.com')
    s.reconcileNetworkEntityIdAtom('node', 'local-1', 'server-1')

    expect(s.pending('server-1')).toBe(true)
    expect(s.pending('unrelated')).toBe(false)
  })
})
