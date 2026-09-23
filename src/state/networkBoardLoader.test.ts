import { describe, expect, it } from 'vitest'
import type { Board } from '../schema/board'
import { mergeBoardContent } from './networkBoardLoader'

function emptyBoard(): Board {
  return {
    version: 5,
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
}

describe('mergeBoardContent', () => {
  it('appends freshly-fetched nodes/edges/images to an empty document', () => {
    const board = emptyBoard()
    const content = {
      nodes: [{ id: 'n1' } as never],
      edges: [{ id: 'e1' } as never],
      images: [{ id: 'img1', dataUri: 'data:x' }],
    }
    const result = mergeBoardContent(board, content)
    expect(result.nodes).toEqual([{ id: 'n1' }])
    expect(result.edges).toEqual([{ id: 'e1' }])
    expect(result.images).toEqual([{ id: 'img1', dataUri: 'data:x' }])
  })

  it('dedupes by id — a re-fetch of already-resident content is a no-op on those ids', () => {
    const board: Board = {
      ...emptyBoard(),
      nodes: [{ id: 'n1', x: 0 } as never],
    }
    const content = {
      nodes: [{ id: 'n1', x: 99 } as never, { id: 'n2' } as never],
      edges: [],
      images: [],
    }
    const result = mergeBoardContent(board, content)
    // The already-resident n1 keeps its own copy; only n2 is newly appended.
    expect(result.nodes).toEqual([{ id: 'n1', x: 0 }, { id: 'n2' }])
  })

  it('leaves `boards` untouched — only nodes/edges/images are merged here', () => {
    const board = emptyBoard()
    const result = mergeBoardContent(board, {
      nodes: [],
      edges: [],
      images: [],
    })
    expect(result.boards).toBe(board.boards)
  })
})
