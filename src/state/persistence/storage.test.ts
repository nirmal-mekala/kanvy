import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../../schema/board'
import { SCHEMA_VERSION } from '../../schema/board'
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
  version: SCHEMA_VERSION,
  nodes: [
    {
      id: 'c1',
      boardId: 'root',
      type: 'card',
      kind: 'text',
      size: 'regular',
      x: 0,
      y: 0,
      w: 224,
      h: 90,
      color: 'gray',
      status: 'active',
      index: 0,
      content: 'hi',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
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

describe('loadBoard', () => {
  it('returns a fresh seed board (ok: true) when nothing is stored', () => {
    const result = loadBoard()
    expect(result.ok).toBe(true)
    expect(result.board.nodes.length).toBeGreaterThan(0)
    if (result.ok) {
      expect(result.freshBoardId).toBeDefined()
      expect(
        result.board.boards.some((b) => b.id === result.freshBoardId),
      ).toBe(true)
    }
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
      images: [],
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
    const boardWithContent = (content: string): Board => ({
      ...validBoard,
      nodes: [{ ...validBoard.nodes[0], content } as Board['nodes'][number]],
    })
    const saver = createDebouncedSaver(400)
    saver.save(boardWithContent('v1'))
    saver.save(boardWithContent('v2'))
    saver.save(boardWithContent('v3'))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    vi.advanceTimersByTime(400)

    const result = loadBoard()
    expect(result.ok).toBe(true)
    expect(result.board.nodes[0]).toMatchObject({ content: 'v3' })
  })

  it('flush writes immediately and cancel drops the pending save', () => {
    const saver = createDebouncedSaver(400)
    saver.save(validBoard)
    saver.flush()
    expect(loadBoard()).toEqual({ ok: true, board: validBoard })

    const saver2 = createDebouncedSaver(400)
    saver2.save({
      ...validBoard,
      nodes: [
        {
          ...validBoard.nodes[0],
          content: 'never written',
        } as Board['nodes'][number],
      ],
    })
    saver2.cancel()
    vi.advanceTimersByTime(400)
    expect(loadBoard()).toEqual({ ok: true, board: validBoard })
  })

  it('routes the flush through a custom `write` function instead of localStorage directly', () => {
    const written: Board[] = []
    const saver = createDebouncedSaver(400, (board) => {
      written.push(board)
    })
    saver.save(validBoard)
    vi.advanceTimersByTime(400)
    expect(written).toEqual([validBoard])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('uses `merge` to accumulate rapid saves instead of replacing the pending value', () => {
    const written: number[][] = []
    const saver = createDebouncedSaver<number[]>(
      400,
      (value) => {
        written.push(value)
      },
      (prev, next) => [...prev, ...next],
    )
    saver.save([1])
    saver.save([2])
    saver.save([3])
    vi.advanceTimersByTime(400)
    expect(written).toEqual([[1, 2, 3]])
  })

  it('starts a fresh (unmerged) pending value after a flush', () => {
    const written: number[][] = []
    const saver = createDebouncedSaver<number[]>(
      400,
      (value) => {
        written.push(value)
      },
      (prev, next) => [...prev, ...next],
    )
    saver.save([1])
    saver.flush()
    saver.save([2])
    vi.advanceTimersByTime(400)
    expect(written).toEqual([[1], [2]])
  })
})
