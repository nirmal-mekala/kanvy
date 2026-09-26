import { describe, expect, it } from 'vitest'
import type { Board } from '../schema/board'
import { SCHEMA_VERSION } from '../schema/board'
import type { BoardMeta } from '../schema/boardMeta'
import type { Edge } from '../schema/edge'
import type { Node } from '../schema/node'
import {
  NODE_REAP_AGE_MS,
  REAP_AGE_MS,
  reapableBoardIds,
  reapableEdgeIds,
  reapableNodeIds,
  reapBoards,
  reapEntities,
} from './reaper'

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

function textNode(
  id: string,
  boardId: string,
  status: Node['status'],
  updatedAt: string,
): Node {
  return {
    id,
    boardId,
    type: 'card',
    kind: 'text',
    size: 'regular',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    status,
    index: 0,
    content: '',
    createdAt: updatedAt,
    updatedAt,
  }
}

function edge(
  id: string,
  boardId: string,
  status: Edge['status'],
  updatedAt: string,
): Edge {
  return {
    id,
    boardId,
    fromNodeId: 'a',
    fromSide: 'right',
    toNodeId: 'b',
    toSide: 'left',
    direction: 'none',
    status,
    createdAt: updatedAt,
    updatedAt,
  }
}

describe('reapableNodeIds', () => {
  it('is empty when nothing is trashed', () => {
    const nodes = [textNode('n1', 'root', 'active', new Date(T0).toISOString())]
    expect(reapableNodeIds(nodes, T0)).toEqual([])
  })

  it('excludes a trashed node younger than NODE_REAP_AGE_MS', () => {
    const recentlyTrashed = new Date(T0 - 1000).toISOString()
    const nodes = [textNode('n1', 'root', 'trashed', recentlyTrashed)]
    expect(reapableNodeIds(nodes, T0)).toEqual([])
  })

  it('includes a trashed node older than NODE_REAP_AGE_MS', () => {
    const longAgo = new Date(T0 - NODE_REAP_AGE_MS - 1000).toISOString()
    const nodes = [textNode('n1', 'root', 'trashed', longAgo)]
    expect(reapableNodeIds(nodes, T0)).toEqual(['n1'])
  })

  it('never includes an active node regardless of age', () => {
    const longAgo = new Date(T0 - NODE_REAP_AGE_MS - 1000).toISOString()
    const nodes = [textNode('n1', 'root', 'active', longAgo)]
    expect(reapableNodeIds(nodes, T0)).toEqual([])
  })
})

describe('reapableEdgeIds', () => {
  it('includes a trashed edge older than NODE_REAP_AGE_MS, excludes a recent one', () => {
    const longAgo = new Date(T0 - NODE_REAP_AGE_MS - 1000).toISOString()
    const recent = new Date(T0 - 1000).toISOString()
    const edges = [
      edge('e-old', 'root', 'trashed', longAgo),
      edge('e-new', 'root', 'trashed', recent),
      edge('e-active', 'root', 'active', longAgo),
    ]
    expect(reapableEdgeIds(edges, T0)).toEqual(['e-old'])
  })
})

function board(overrides: Partial<Board> = {}): Board {
  const now = new Date(T0).toISOString()
  return {
    version: SCHEMA_VERSION,
    nodes: [],
    edges: [],
    boards: [boardMeta('root', 'active', now)],
    images: [],
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
          status: 'active',
          index: 0,
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
          status: 'active',
          index: 0,
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
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
      images: [{ id: 'img1', dataUri: 'data:image/png;base64,abc' }],
    })

    const result = reapBoards(b, ['child-1'])

    expect(result.boards.map((meta) => meta.id)).toEqual(['root'])
    expect(result.nodes.map((n) => n.id)).toEqual(['root-card'])
    expect(result.edges).toEqual([])
    expect(result.images).toEqual([])
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
          status: 'active',
          index: 0,
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

describe('reapEntities', () => {
  it('is a no-op when nothing is reapable', () => {
    const b = board()
    expect(reapEntities(b, T0)).toBe(b)
  })

  it('purges old trashed nodes/edges and prunes their now-orphaned image, leaving young tombstones untouched', () => {
    const longAgo = new Date(T0 - NODE_REAP_AGE_MS - 1000).toISOString()
    const recent = new Date(T0 - 1000).toISOString()
    const b = board({
      nodes: [
        textNode('old-trashed', 'root', 'trashed', longAgo),
        textNode('new-trashed', 'root', 'trashed', recent),
        textNode('active-node', 'root', 'active', longAgo),
        {
          id: 'old-image',
          boardId: 'root',
          type: 'card',
          kind: 'image',
          imageId: 'img1',
          x: 0,
          y: 0,
          w: 224,
          h: 90,
          color: 'gray',
          status: 'trashed',
          index: 0,
          content: '',
          createdAt: longAgo,
          updatedAt: longAgo,
        },
      ],
      edges: [
        edge('old-edge', 'root', 'trashed', longAgo),
        edge('new-edge', 'root', 'trashed', recent),
      ],
      images: [{ id: 'img1', dataUri: 'data:image/png;base64,abc' }],
    })

    const result = reapEntities(b, T0)

    expect(result.nodes.map((n) => n.id).sort()).toEqual(
      ['new-trashed', 'active-node'].sort(),
    )
    expect(result.edges.map((e) => e.id)).toEqual(['new-edge'])
    expect(result.images).toEqual([])
  })

  it('also sweeps trashed boards (and their content) in the same pass', () => {
    const longAgo = new Date(T0 - REAP_AGE_MS - 1000).toISOString()
    const b = board({
      boards: [
        boardMeta('root', 'active', longAgo),
        boardMeta('child-1', 'trashed', longAgo),
      ],
      nodes: [textNode('child-card', 'child-1', 'active', longAgo)],
    })

    const result = reapEntities(b, T0)

    expect(result.boards.map((meta) => meta.id)).toEqual(['root'])
    expect(result.nodes).toEqual([])
  })
})
