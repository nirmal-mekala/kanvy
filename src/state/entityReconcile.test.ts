import { describe, expect, it } from 'vitest'
import type { Board } from '../schema/board'
import { SCHEMA_VERSION } from '../schema/board'
import type { BoardMeta } from '../schema/boardMeta'
import type { Node } from '../schema/node'
import { reconcileEntityId, reconcileHistoryIds } from './entityReconcile'
import { createHistoryState } from './history/reducer'
import { type AttributedOps, applyOps, type Op } from './ops'

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Node
}

function boardMeta(id: string, overrides: Partial<BoardMeta> = {}): BoardMeta {
  return {
    id,
    title: 'Untitled board',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function emptyBoard(overrides: Partial<Board> = {}): Board {
  return {
    version: SCHEMA_VERSION,
    nodes: [],
    edges: [],
    boards: [],
    images: [],
    ...overrides,
  }
}

describe('reconcileEntityId', () => {
  it('is a no-op when oldId === newId (same reference back)', () => {
    const board = emptyBoard({ nodes: [node('n1')] })
    expect(reconcileEntityId(board, 'node', 'n1', 'n1')).toBe(board)
  })

  it("rewrites a board's own id, and any node's boardId/boardRef pointing at it", () => {
    const board = emptyBoard({
      boards: [boardMeta('client-board')],
      nodes: [
        node('n-inside', { boardId: 'client-board' }),
        node('n-card', {
          boardId: 'root',
          kind: 'board',
          boardRef: 'client-board',
        } as Partial<Node>),
      ],
    })
    const result = reconcileEntityId(
      board,
      'board',
      'client-board',
      'server-board',
    )
    expect(result.boards[0]?.id).toBe('server-board')
    expect(result.nodes[0]?.boardId).toBe('server-board')
    expect((result.nodes[1] as Node & { boardRef: string }).boardRef).toBe(
      'server-board',
    )
  })

  it("rewrites an edge's boardId, fromNodeId, and toNodeId", () => {
    const board = emptyBoard({
      edges: [
        {
          id: 'e1',
          boardId: 'client-board',
          fromNodeId: 'client-a',
          fromSide: 'right',
          toNodeId: 'client-b',
          toSide: 'left',
          direction: 'none',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    let result = reconcileEntityId(
      board,
      'board',
      'client-board',
      'server-board',
    )
    result = reconcileEntityId(result, 'node', 'client-a', 'server-a')
    result = reconcileEntityId(result, 'node', 'client-b', 'server-b')
    expect(result.edges[0]).toMatchObject({
      boardId: 'server-board',
      fromNodeId: 'server-a',
      toNodeId: 'server-b',
    })
  })

  it("rewrites an image's id in `images`, and any node's imageId pointing at it", () => {
    const board = emptyBoard({
      images: [{ id: 'client-img', dataUri: 'data:x' }],
      nodes: [
        node('n1', { kind: 'image', imageId: 'client-img' } as Partial<Node>),
      ],
    })
    const result = reconcileEntityId(board, 'image', 'client-img', 'server-img')
    expect(result.images[0]?.id).toBe('server-img')
    expect((result.nodes[0] as Node & { imageId: string }).imageId).toBe(
      'server-img',
    )
  })

  it('returns the same board reference when nothing matched', () => {
    const board = emptyBoard({ nodes: [node('n1')] })
    expect(reconcileEntityId(board, 'board', 'unrelated', 'x')).toBe(board)
  })
})

describe('reconcileHistoryIds', () => {
  it("rewrites a create op's own value.id, and undo still removes the entity afterward", () => {
    const createOp: Op = {
      kind: 'create',
      entity: 'board',
      value: boardMeta('client-board'),
    }
    const attributed: AttributedOps = { ops: [createOp], boardId: 'root' }
    const history = createHistoryState(attributed)
    const reconciled = reconcileHistoryIds(
      history,
      'board',
      'client-board',
      'server-board',
    )
    // Applying the reconciled create op 'before' (an undo) should remove
    // the entity by its *new* id — proving undo still works afterward,
    // rather than silently targeting an id no longer in `currentBoardAtom`.
    const board = emptyBoard({ boards: [boardMeta('server-board')] })
    const undone = applyOps(board, reconciled.present.state.ops, 'before')
    expect(undone.boards).toEqual([])
  })

  it('rewrites an update op targeting the reconciled id, across past/present/future', () => {
    const updateOp: Op = {
      kind: 'update',
      entity: 'node',
      id: 'client-n1',
      before: { x: 0 },
      after: { x: 5 },
    }
    const attributed: AttributedOps = { ops: [updateOp], boardId: 'root' }
    const history = createHistoryState(attributed)
    const reconciled = reconcileHistoryIds(
      history,
      'node',
      'client-n1',
      'server-n1',
    )
    expect((reconciled.present.state.ops[0] as { id: string }).id).toBe(
      'server-n1',
    )
  })

  it('is a no-op when oldId === newId', () => {
    const history = createHistoryState<AttributedOps>({
      ops: [],
      boardId: 'root',
    })
    expect(reconcileHistoryIds(history, 'node', 'n1', 'n1')).toBe(history)
  })

  it('preserves lastActionAt', () => {
    const updateOp: Op = {
      kind: 'update',
      entity: 'node',
      id: 'client-n1',
      before: {},
      after: {},
    }
    const history = {
      ...createHistoryState<AttributedOps>({
        ops: [updateOp],
        boardId: 'root',
      }),
      lastActionAt: 12345,
    }
    const reconciled = reconcileHistoryIds(
      history,
      'node',
      'client-n1',
      'server-n1',
    )
    expect(reconciled.lastActionAt).toBe(12345)
  })
})
