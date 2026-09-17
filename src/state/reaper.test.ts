import { describe, expect, it } from 'vitest'
import type { Board } from '../schema/board'
import { SCHEMA_VERSION } from '../schema/board'
import type { BoardMeta } from '../schema/boardMeta'
import { REAP_AGE_MS, reapableBoardIds, reapBoards } from './reaper'

const T0 = new Date('2026-01-02T00:00:00.000Z').getTime()

function boardMeta(
  id: string,
  status: BoardMeta['status'],
  updatedAt: string,
): BoardMeta {
  return {
    id,
    title: 'Board',
    status,
    createdAt: updatedAt,
    updatedAt,
  }
}

describe('reapableBoardIds', () => {
  it('is empty when nothing is trashed', () => {
    const boards = [boardMeta('root', 'active', new Date(T0).toISOString())]
    expect(reapableBoardIds(boards, T0)).toEqual([])
  })

  it('excludes a trashed board younger than REAP_AGE_MS', () => {
    const recentlyTrashed = new Date(T0 - 1000).toISOString() // 1s ago
    const boards = [boardMeta('child-1', 'trashed', recentlyTrashed)]
    expect(reapableBoardIds(boards, T0)).toEqual([])
  })

  it('excludes a trashed board exactly at the REAP_AGE_MS boundary (strictly older required)', () => {
    const atBoundary = new Date(T0 - REAP_AGE_MS).toISOString()
    const boards = [boardMeta('child-1', 'trashed', atBoundary)]
    expect(reapableBoardIds(boards, T0)).toEqual([])
  })

  it('includes a trashed board older than REAP_AGE_MS', () => {
    const longAgo = new Date(T0 - REAP_AGE_MS - 1000).toISOString()
    const boards = [boardMeta('child-1', 'trashed', longAgo)]
    expect(reapableBoardIds(boards, T0)).toEqual(['child-1'])
  })

  it('never includes an active board regardless of age', () => {
    const longAgo = new Date(T0 - REAP_AGE_MS - 1000).toISOString()
    const boards = [boardMeta('root', 'active', longAgo)]
    expect(reapableBoardIds(boards, T0)).toEqual([])
  })

  it('evaluates each board independently in a mixed collection', () => {
    const longAgo = new Date(T0 - REAP_AGE_MS - 1000).toISOString()
    const recent = new Date(T0 - 1000).toISOString()
    const boards = [
      boardMeta('root', 'active', longAgo),
      boardMeta('old-trash', 'trashed', longAgo),
      boardMeta('new-trash', 'trashed', recent),
    ]
    expect(reapableBoardIds(boards, T0)).toEqual(['old-trash'])
  })
})

function board(overrides: Partial<Board> = {}): Board {
  const now = new Date(T0).toISOString()
  return {
    version: SCHEMA_VERSION,
    nodes: [],
    edges: [],
    boards: [boardMeta('root', 'active', now)],
    images: {},
    ...overrides,
  }
}

describe('reapBoards', () => {
  it('is a no-op for an empty boardIds list', () => {
    const b = board()
    expect(reapBoards(b, [])).toBe(b)
  })

  it('removes the board metadata and every node/edge/image belonging only to it', () => {
    const now = new Date(T0).toISOString()
    const b = board({
      boards: [
        boardMeta('root', 'active', now),
        boardMeta('child-1', 'trashed', now),
      ],
      nodes: [
        {
          id: 'root-card',
          boardId: 'root',
          type: 'card',
          kind: 'text',
          size: 'regular',
          x: 0,
          y: 0,
          w: 224,
          h: 90,
          color: 'gray',
          content: '',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'child-image',
          boardId: 'child-1',
          type: 'card',
          kind: 'image',
          imageId: 'img1',
          x: 0,
          y: 0,
          w: 224,
          h: 90,
          color: 'gray',
          content: '',
          createdAt: now,
          updatedAt: now,
        },
      ],
      edges: [
        {
          id: 'e1',
          boardId: 'child-1',
          fromNodeId: 'child-image',
          fromSide: 'right',
          toNodeId: 'child-image',
          toSide: 'left',
          direction: 'none',
          createdAt: now,
          updatedAt: now,
        },
      ],
      images: { img1: 'data:image/png;base64,abc' },
    })

    const result = reapBoards(b, ['child-1'])

    expect(result.boards.map((meta) => meta.id)).toEqual(['root'])
    expect(result.nodes.map((n) => n.id)).toEqual(['root-card'])
    expect(result.edges).toEqual([])
    expect(result.images).toEqual({})
  })

  it('leaves other boards entirely untouched', () => {
    const now = new Date(T0).toISOString()
    const b = board({
      boards: [
        boardMeta('root', 'active', now),
        boardMeta('child-1', 'trashed', now),
        boardMeta('child-2', 'active', now),
      ],
      nodes: [
        {
          id: 'n2',
          boardId: 'child-2',
          type: 'card',
          kind: 'text',
          size: 'regular',
          x: 0,
          y: 0,
          w: 224,
          h: 90,
          color: 'gray',
          content: 'kept',
          createdAt: now,
          updatedAt: now,
        },
      ],
    })

    const result = reapBoards(b, ['child-1'])

    expect(result.boards.map((meta) => meta.id)).toEqual(['root', 'child-2'])
    expect(result.nodes).toHaveLength(1)
  })
})
