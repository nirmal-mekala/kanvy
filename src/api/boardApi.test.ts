import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../schema/board'
import { SCHEMA_VERSION } from '../schema/board'
import { STORAGE_KEY } from '../state/persistence/storage'
import { fetchBoard, saveBoard, simulateNetwork } from './boardApi'

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

const validBoard: Board = {
  version: SCHEMA_VERSION,
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

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})

describe('simulateNetwork', () => {
  it('runs immediately with zero latency and zero error rate', async () => {
    const result = await simulateNetwork(0, 0, () => 'ok')
    expect(result).toBe('ok')
  })

  it('waits at least `latencyMs` before resolving', async () => {
    vi.useFakeTimers()
    const promise = simulateNetwork(200, 0, () => 'ok')
    let resolved = false
    promise.then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(199)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(resolved).toBe(true)
    vi.useRealTimers()
  })

  it('rejects when the injected `random` falls under `errorRate`', async () => {
    await expect(
      simulateNetwork(
        0,
        0.5,
        () => 'ok',
        () => 0.1,
      ),
    ).rejects.toThrow(/Simulated network error/)
  })

  it('resolves when the injected `random` falls at or above `errorRate`', async () => {
    await expect(
      simulateNetwork(
        0,
        0.5,
        () => 'ok',
        () => 0.9,
      ),
    ).resolves.toBe('ok')
  })
})

describe('fetchBoard / saveBoard', () => {
  it('saveBoard writes a board fetchBoard can read back', async () => {
    await saveBoard(validBoard)
    const result = await fetchBoard()
    expect(result).toEqual({ ok: true, board: validBoard })
  })

  it('fetchBoard mints a fresh seed board when nothing is stored', async () => {
    const result = await fetchBoard()
    expect(result.ok).toBe(true)
    expect(result.board.nodes.length).toBeGreaterThan(0)
  })

  it('saveBoard persists directly to the storage key saveBoard/fetchBoard share', async () => {
    await saveBoard(validBoard)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })
})
