import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../../schema/board'
import {
  createDebouncedSaver,
  loadBoard,
  STORAGE_KEY,
  writeBoard,
} from './storage'

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
  version: 1,
  nodes: [
    {
      id: 'c1',
      type: 'card',
      kind: 'text',
      size: 'regular',
      x: 0,
      y: 0,
      w: 224,
      h: 90,
      color: 'gray',
      content: 'hi',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  edges: [],
  images: {},
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})

describe('loadBoard', () => {
  it('returns a fresh seed board (ok: true) when nothing is stored', () => {
    const result = loadBoard()
    expect(result.ok).toBe(true)
    expect(result.board.nodes.length).toBeGreaterThan(0)
  })

  it('returns the stored board when it is valid', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validBoard))
    const result = loadBoard()
    expect(result.ok).toBe(true)
    expect(result.board).toEqual(validBoard)
  })

  it('reports a parse error and falls back to seed, preserving the raw bytes', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const result = loadBoard()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('parse-error')
      expect(result.raw).toBe('{not json')
      expect(result.board.nodes.length).toBeGreaterThan(0)
    }
  })

  it('reports a validation error for schema-invalid JSON, preserving the raw bytes', () => {
    const raw = JSON.stringify({
      version: 1,
      nodes: [{ bogus: true }],
      edges: [],
      images: {},
    })
    localStorage.setItem(STORAGE_KEY, raw)
    const result = loadBoard()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('validation-error')
      expect(result.raw).toBe(raw)
    }
  })

  it('does not overwrite the corrupt data itself while reporting the failure', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    loadBoard()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not json')
  })
})

describe('writeBoard', () => {
  it('persists a board that loadBoard can read back', () => {
    writeBoard(validBoard)
    expect(loadBoard()).toEqual({ ok: true, board: validBoard })
  })
})

describe('createDebouncedSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces rapid saves into a single write after the delay', () => {
    const saver = createDebouncedSaver(400)
    saver.save({ ...validBoard, version: 1 })
    saver.save({ ...validBoard, version: 2 })
    saver.save({ ...validBoard, version: 3 })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    vi.advanceTimersByTime(400)

    const result = loadBoard()
    expect(result.ok).toBe(true)
    expect(result.board.version).toBe(3)
  })

  it('flush writes immediately and cancel drops the pending save', () => {
    const saver = createDebouncedSaver(400)
    saver.save(validBoard)
    saver.flush()
    expect(loadBoard()).toEqual({ ok: true, board: validBoard })

    const saver2 = createDebouncedSaver(400)
    saver2.save({ ...validBoard, version: 99 })
    saver2.cancel()
    vi.advanceTimersByTime(400)
    expect(loadBoard()).toEqual({ ok: true, board: validBoard })
  })
})
