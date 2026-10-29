import { createStore, getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Node } from '../../schema/node'
import type { Op } from '../ops'

const { saveBoardMock, saveBoardOverNetworkMock } = vi.hoisted(() => ({
  saveBoardMock: vi.fn(() => Promise.resolve()),
  saveBoardOverNetworkMock: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../api/boardApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/boardApi')>()),
  saveBoard: saveBoardMock,
  saveBoardOverNetwork: saveBoardOverNetworkMock,
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

function textNode(id: string): Node {
  return {
    id,
    boardId: 'h0me0b0ard00',
    nodeType: 'card',
    cardType: 'text',
    size: 'regular',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    task: 'none',
    status: 'active',
    position: 0,
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Node
}

const CONFIG = {
  baseUrl: 'http://localhost:1996',
  authToken: '',
  dialectId: 'json-server',
}

/** The ids of every node a save's ops create. */
function createdIds(ops: readonly Op[]): string[] {
  return ops.flatMap((op) => (op.kind === 'create' ? [op.value.id] : []))
}

// Fresh modules per test — boardHistoryAtom's debounced saver and its
// mode-change subscription are module-level singletons (see
// state/atoms/nodes.test.ts's `freshState`).
async function freshState() {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.resetModules()
  return {
    ...(await import('../atoms/nodes')),
    ...(await import('../atoms/networkSettings')),
    ...(await import('./boardHistoryAtom')),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  saveBoardMock.mockClear()
  saveBoardOverNetworkMock.mockClear()
})

describe('autosave across a mode switch', () => {
  it('a still-debounced Local edit is saved locally when the mode switches to Network, never sent to the backend', async () => {
    const { addNodeAtom, accessModeAtom, networkConfigAtom } =
      await freshState()
    const store = getDefaultStore()
    store.set(addNodeAtom, textNode('local-1'))

    store.set(networkConfigAtom, CONFIG)
    store.set(accessModeAtom, 'network')
    await vi.runAllTimersAsync()

    expect(saveBoardOverNetworkMock).not.toHaveBeenCalled()
    expect(saveBoardMock).toHaveBeenCalledTimes(1)
    const [board] = saveBoardMock.mock.lastCall as unknown as [
      { nodes: Node[] },
    ]
    expect(board.nodes.some((n) => n.id === 'local-1')).toBe(true)
  })

  it('a still-debounced Network edit is sent to the backend when the mode switches to Local, not merged into a Local save', async () => {
    const { addNodeAtom, accessModeAtom, networkConfigAtom } =
      await freshState()
    const store = getDefaultStore()
    store.set(networkConfigAtom, CONFIG)
    store.set(accessModeAtom, 'network')
    store.set(addNodeAtom, textNode('net-1'))

    store.set(accessModeAtom, 'local')
    store.set(addNodeAtom, textNode('local-1'))
    await vi.runAllTimersAsync()

    expect(saveBoardOverNetworkMock).toHaveBeenCalledTimes(1)
    const [config, ops] = saveBoardOverNetworkMock.mock.lastCall as unknown as [
      typeof CONFIG,
      Op[],
    ]
    expect(config).toEqual(CONFIG)
    expect(createdIds(ops)).toEqual(['net-1'])
    expect(saveBoardMock).toHaveBeenCalledTimes(1)
  })

  it('never merges saves bound for different targets, even without the mode-change flush', async () => {
    // A non-default store: the module's mode-change subscription only
    // watches the default store, so this isolates `queueSave`'s own guard.
    const { addNodeAtom, accessModeAtom, networkConfigAtom } =
      await freshState()
    const store = createStore()
    store.set(networkConfigAtom, CONFIG)
    store.set(accessModeAtom, 'network')
    store.set(addNodeAtom, textNode('net-1'))
    store.set(accessModeAtom, 'local')
    store.set(addNodeAtom, textNode('local-1'))
    await vi.runAllTimersAsync()

    expect(saveBoardOverNetworkMock).toHaveBeenCalledTimes(1)
    const [, ops] = saveBoardOverNetworkMock.mock.lastCall as unknown as [
      typeof CONFIG,
      Op[],
    ]
    expect(createdIds(ops)).toEqual(['net-1'])
    expect(saveBoardMock).toHaveBeenCalledTimes(1)
  })

  it('a save goes to the connection its edit was made against, even if the base URL changes before it flushes', async () => {
    const { addNodeAtom, accessModeAtom, networkConfigAtom } =
      await freshState()
    const store = createStore()
    store.set(networkConfigAtom, CONFIG)
    store.set(accessModeAtom, 'network')
    store.set(addNodeAtom, textNode('net-1'))
    store.set(networkConfigAtom, { ...CONFIG, baseUrl: 'http://other:1996' })
    store.set(addNodeAtom, textNode('net-2'))
    await vi.runAllTimersAsync()

    const calls = saveBoardOverNetworkMock.mock.calls as unknown as [
      typeof CONFIG,
      Op[],
    ][]
    expect(
      calls.map(([config, ops]) => [config.baseUrl, createdIds(ops)]),
    ).toEqual([
      ['http://localhost:1996', ['net-1']],
      ['http://other:1996', ['net-2']],
    ])
  })
})

// ctx/notes/261029-edits-to-unconfirmed-creates.md
describe('network saves are an ordered, retrying outbox', () => {
  async function networkState() {
    const state = await freshState()
    const toasts = await import('../atoms/toasts')
    const store = getDefaultStore()
    store.set(state.networkConfigAtom, CONFIG)
    store.set(state.accessModeAtom, 'network')
    return { ...state, ...toasts, store }
  }

  function sentCreates(): string[][] {
    const calls = saveBoardOverNetworkMock.mock.calls as unknown as [
      typeof CONFIG,
      Op[],
    ][]
    return calls.map(([, ops]) => createdIds(ops))
  }

  it('holds a later save until the earlier one has finished, so it never races a create still in flight', async () => {
    const { addNodeAtom, store } = await networkState()
    let finishFirst = () => {}
    saveBoardOverNetworkMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve
        }),
    )

    store.set(addNodeAtom, textNode('net-1'))
    await vi.advanceTimersByTimeAsync(1000)
    store.set(addNodeAtom, textNode('net-2'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(sentCreates()).toEqual([['net-1']])

    finishFirst()
    await vi.runAllTimersAsync()
    expect(sentCreates()).toEqual([['net-1'], ['net-2']])
  })

  it('retries a failed save with backoff instead of dropping it, toasting once per run of failures, and keeps later saves queued behind it', async () => {
    const { addNodeAtom, toastsAtom, store } = await networkState()
    saveBoardOverNetworkMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))

    store.set(addNodeAtom, textNode('net-1'))
    await vi.advanceTimersByTimeAsync(600)
    expect(sentCreates()).toEqual([['net-1']])
    store.set(addNodeAtom, textNode('net-2'))
    // The first retry waits 1s after the failure.
    await vi.advanceTimersByTimeAsync(1000)
    expect(sentCreates()).toEqual([['net-1'], ['net-1']])
    expect(store.get(toastsAtom)).toHaveLength(1)

    await vi.runAllTimersAsync()
    expect(sentCreates()).toEqual([['net-1'], ['net-1'], ['net-1'], ['net-2']])
    expect(store.get(toastsAtom)).toHaveLength(1)
  })
})
