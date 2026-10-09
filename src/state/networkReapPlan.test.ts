import { describe, expect, it } from 'vitest'
import type { BoardMeta } from '../schema/boardMeta'
import type { Edge } from '../schema/edge'
import type { Node } from '../schema/node'
import {
  candidateNodeIds,
  imageCandidateIds,
  type NetworkReapCandidates,
  planNetworkReap,
  reapCandidateBoardIds,
  unreferencedImageIds,
} from './networkReapPlan'
import { NODE_REAP_AGE_MS, REAP_AGE_MS } from './reaper'

const NOW = new Date('2026-10-09T00:00:00.000Z').getTime()
const AGED = new Date(NOW - REAP_AGE_MS - 1000).toISOString()
const FRESH = new Date(NOW - 1000).toISOString()

type Status = 'active' | 'trashed'

function board(id: string, status: Status, updatedAt = AGED): BoardMeta {
  return {
    id,
    title: id,
    status,
    isRoot: false,
    createdAt: updatedAt,
    updatedAt,
  }
}

function card(
  id: string,
  boardId: string,
  status: Status,
  updatedAt = AGED,
  fields: Record<string, unknown> = { cardType: 'text', size: 'regular' },
): Node {
  return {
    id,
    boardId,
    nodeType: 'card',
    content: '',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    task: 'none',
    status,
    position: 0,
    createdAt: updatedAt,
    updatedAt,
    ...fields,
  } as Node
}

function imageCard(
  id: string,
  boardId: string,
  status: Status,
  imageId: string,
  updatedAt = AGED,
): Node {
  return card(id, boardId, status, updatedAt, { cardType: 'image', imageId })
}

function boardCard(
  id: string,
  boardId: string,
  status: Status,
  boardRef: string,
): Node {
  return card(id, boardId, status, AGED, { cardType: 'board', boardRef })
}

function edge(
  id: string,
  boardId: string,
  status: Status,
  fromNodeId = 'a',
  toNodeId = 'b',
  updatedAt = AGED,
): Edge {
  return {
    id,
    boardId,
    fromNodeId,
    fromSide: 'right',
    toNodeId,
    toSide: 'left',
    direction: 'none',
    status,
    createdAt: updatedAt,
    updatedAt,
  }
}

function candidates(
  overrides: Partial<NetworkReapCandidates>,
): NetworkReapCandidates {
  return {
    trashedBoards: [],
    trashedNodes: [],
    trashedEdges: [],
    boardNodes: [],
    boardEdges: [],
    boardCards: [],
    touchingEdges: [],
    ...overrides,
  }
}

describe('reapCandidateBoardIds', () => {
  it('takes aged, trashed boards only, using the local reaper’s strict age boundary', () => {
    const atBoundary = new Date(NOW - REAP_AGE_MS).toISOString()
    expect(
      reapCandidateBoardIds(
        [
          board('aged', 'trashed'),
          board('fresh', 'trashed', FRESH),
          board('boundary', 'trashed', atBoundary),
          board('live', 'active'),
        ],
        NOW,
      ),
    ).toEqual(['aged'])
  })

  it('never takes the root board, even if it somehow comes back trashed', () => {
    const root = { ...board('root', 'trashed'), isRoot: true }
    expect(reapCandidateBoardIds([root], NOW)).toEqual([])
  })
})

describe('candidateNodeIds', () => {
  it("is aged, trashed nodes plus everything on candidate boards — deduped, and before any board's been skipped", () => {
    const onBoard = card('n2', 'b1', 'active')
    expect(
      candidateNodeIds(
        {
          trashedNodes: [
            card('n1', 'h', 'trashed'),
            card('fresh', 'h', 'trashed', FRESH),
            card('n2', 'b1', 'trashed'),
          ],
          boardNodes: [onBoard],
        },
        NOW,
      ).sort(),
    ).toEqual(['n1', 'n2'])
  })
})

describe('planNetworkReap', () => {
  it('reaps aged, trashed nodes and edges on their own, honoring the node age boundary', () => {
    const atBoundary = new Date(NOW - NODE_REAP_AGE_MS).toISOString()
    const plan = planNetworkReap(
      candidates({
        trashedNodes: [
          card('n1', 'h', 'trashed'),
          card('n-boundary', 'h', 'trashed', atBoundary),
          card('n-fresh', 'h', 'trashed', FRESH),
        ],
        trashedEdges: [
          edge('e1', 'h', 'trashed'),
          edge('e-fresh', 'h', 'trashed', 'a', 'b', FRESH),
        ],
      }),
      NOW,
    )
    expect(plan.nodes.map((n) => n.id)).toEqual(['n1'])
    expect(plan.edgeIds).toEqual(['e1'])
    expect(plan.boards).toEqual([])
  })

  it('deletes everything on a reaped board regardless of its own status, and makes the board wait on all of it', () => {
    const plan = planNetworkReap(
      candidates({
        trashedBoards: [board('b1', 'trashed')],
        boardNodes: [
          card('live', 'b1', 'active'),
          card('trashed-fresh', 'b1', 'trashed', FRESH),
        ],
        boardEdges: [edge('e1', 'b1', 'active', 'live', 'trashed-fresh')],
        boardCards: [boardCard('bc', 'h', 'trashed', 'b1')],
        trashedNodes: [boardCard('bc', 'h', 'trashed', 'b1')],
      }),
      NOW,
    )
    expect(plan.edgeIds).toEqual(['e1'])
    expect(plan.nodes.map((n) => n.id).sort()).toEqual([
      'bc',
      'live',
      'trashed-fresh',
    ])
    expect(plan.nodes.find((n) => n.id === 'live')?.edgeIds).toEqual(['e1'])
    expect(plan.boards).toEqual([
      { id: 'b1', nodeIds: ['bc', 'live', 'trashed-fresh'], edgeIds: ['e1'] },
    ])
    expect(plan.skippedBoards).toEqual([])
  })

  it('skips a board a live board card still points at, keeping its content', () => {
    const plan = planNetworkReap(
      candidates({
        trashedBoards: [board('b1', 'trashed')],
        boardNodes: [card('n1', 'b1', 'active')],
        boardEdges: [edge('e1', 'b1', 'active', 'n1', 'n1')],
        boardCards: [boardCard('bc', 'h', 'active', 'b1')],
      }),
      NOW,
    )
    expect(plan.boards).toEqual([])
    expect(plan.nodes).toEqual([])
    expect(plan.edgeIds).toEqual([])
    expect(plan.skippedBoards).toEqual([
      { id: 'b1', reason: 'still referenced by active board card bc' },
    ])
  })

  it('skips a board whose only card sits on another skipped board — the skip cascades', () => {
    const plan = planNetworkReap(
      candidates({
        trashedBoards: [board('outer', 'trashed'), board('inner', 'trashed')],
        boardNodes: [boardCard('inner-card', 'outer', 'active', 'inner')],
        boardCards: [
          boardCard('outer-card', 'h', 'active', 'outer'),
          boardCard('inner-card', 'outer', 'active', 'inner'),
        ],
      }),
      NOW,
    )
    expect(plan.boards).toEqual([])
    expect(plan.nodes).toEqual([])
    expect(plan.skippedBoards.map((b) => b.id).sort()).toEqual([
      'inner',
      'outer',
    ])
  })

  it('defensively deletes a not-yet-reapable edge touching a deleted node, and makes the node wait on it', () => {
    const plan = planNetworkReap(
      candidates({
        trashedNodes: [card('n1', 'h', 'trashed')],
        touchingEdges: [
          edge('dangling', 'h', 'active', 'n1', 'other'),
          edge('unrelated', 'h', 'active', 'x', 'y'),
        ],
      }),
      NOW,
    )
    expect(plan.edgeIds).toEqual(['dangling'])
    expect(plan.nodes).toEqual([
      { id: 'n1', edgeIds: ['dangling'], imageId: undefined },
    ])
  })

  it("records each deleted image card's imageId", () => {
    const plan = planNetworkReap(
      candidates({ trashedNodes: [imageCard('n1', 'h', 'trashed', 'img1')] }),
      NOW,
    )
    expect(plan.nodes).toEqual([{ id: 'n1', edgeIds: [], imageId: 'img1' }])
  })
})

describe('imageCandidateIds', () => {
  it('comes only from nodes that were actually deleted, deduped', () => {
    const plan = planNetworkReap(
      candidates({
        trashedNodes: [
          imageCard('n1', 'h', 'trashed', 'img1'),
          imageCard('n2', 'h', 'trashed', 'img1'),
          imageCard('n3', 'h', 'trashed', 'img3'),
          card('n4', 'h', 'trashed'),
        ],
      }),
      NOW,
    )
    expect(imageCandidateIds(plan, new Set(['n1', 'n2', 'n4']))).toEqual([
      'img1',
    ])
  })
})

describe('unreferencedImageIds', () => {
  it('keeps any image a remaining node of any status (or on any board) still references', () => {
    expect(
      unreferencedImageIds(
        ['shared', 'trashed-ref', 'orphan'],
        [
          imageCard('live', 'other-board', 'active', 'shared'),
          imageCard('t', 'h', 'trashed', 'trashed-ref', FRESH),
        ],
      ),
    ).toEqual(['orphan'])
  })
})
