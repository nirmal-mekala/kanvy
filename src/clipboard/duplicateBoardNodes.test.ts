import { describe, expect, it } from 'vitest'
import type { Board } from '../schema/board'
import { SCHEMA_VERSION } from '../schema/board'
import type { BoardCard } from '../schema/node'
import { duplicateBoardNodes } from './duplicateBoardNodes'

const NOW = '2026-01-01T00:00:00.000Z'

function boardCard(id: string, boardRef: string, x = 100, y = 100): BoardCard {
  return {
    id,
    boardId: 'root',
    type: 'card',
    kind: 'board',
    boardRef,
    x,
    y,
    w: 224,
    h: 90,
    color: 'gray',
    content: '',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function board(overrides: Partial<Board> = {}): Board {
  return {
    version: SCHEMA_VERSION,
    nodes: [],
    edges: [],
    boards: [
      {
        id: 'root',
        title: 'Home',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'child-1',
        title: 'Child board',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    images: {},
    ...overrides,
  }
}

describe('duplicateBoardNodes', () => {
  it('mints a fresh board metadata entry, preserving the source title', () => {
    const b = board()
    const result = duplicateBoardNodes([boardCard('bn1', 'child-1')], b, 40)

    expect(result.boards).toHaveLength(1)
    expect(result.boards[0]?.title).toBe('Child board')
    expect(result.boards[0]?.id).not.toBe('child-1')
    expect(result.boards[0]?.status).toBe('active')
  })

  it("deep-copies the source board's content with fresh ids and the new boardId", () => {
    const b = board({
      nodes: [
        boardCard('bn1', 'child-1'),
        {
          id: 'content-1',
          boardId: 'child-1',
          type: 'card',
          kind: 'text',
          size: 'regular',
          x: 0,
          y: 0,
          w: 224,
          h: 90,
          color: 'gray',
          content: 'hello',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    const result = duplicateBoardNodes([boardCard('bn1', 'child-1')], b, 40)

    const newBoardId = result.boards[0]?.id
    const copiedContent = result.nodes.find(
      (n) => n.type === 'card' && n.kind === 'text',
    )
    expect(copiedContent?.id).not.toBe('content-1')
    expect(copiedContent?.boardId).toBe(newBoardId)
    expect(copiedContent?.type === 'card' && copiedContent.content).toBe(
      'hello',
    )
  })

  it('remaps edge endpoints to the copied nodes fresh ids', () => {
    const b = board({
      nodes: [
        boardCard('bn1', 'child-1'),
        {
          id: 'a',
          boardId: 'child-1',
          type: 'card',
          kind: 'text',
          size: 'regular',
          x: 0,
          y: 0,
          w: 224,
          h: 90,
          color: 'gray',
          content: '',
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: 'c',
          boardId: 'child-1',
          type: 'card',
          kind: 'text',
          size: 'regular',
          x: 300,
          y: 0,
          w: 224,
          h: 90,
          color: 'gray',
          content: '',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      edges: [
        {
          id: 'e1',
          boardId: 'child-1',
          fromNodeId: 'a',
          fromSide: 'right',
          toNodeId: 'c',
          toSide: 'left',
          direction: 'none',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    const result = duplicateBoardNodes([boardCard('bn1', 'child-1')], b, 40)

    expect(result.edges).toHaveLength(1)
    const edge = result.edges[0]
    const copiedA = result.nodes.find(
      (n) => n.type === 'card' && n.content === '' && n.x === 0,
    )
    const copiedC = result.nodes.find(
      (n) => n.type === 'card' && n.content === '' && n.x === 300,
    )
    expect(edge?.fromNodeId).toBe(copiedA?.id)
    expect(edge?.toNodeId).toBe(copiedC?.id)
    expect(edge?.boardId).toBe(result.boards[0]?.id)
  })

  it('places the new board-node card at the original position plus offset', () => {
    const result = duplicateBoardNodes(
      [boardCard('bn1', 'child-1', 100, 100)],
      board(),
      40,
    )
    expect(result.newBoardNodeCards[0]?.x).toBe(140)
    expect(result.newBoardNodeCards[0]?.y).toBe(140)
    expect(result.newBoardNodeCards[0]?.boardRef).toBe(result.boards[0]?.id)
  })

  it('duplicates multiple board nodes independently, one fresh board each', () => {
    const b = board({
      boards: [
        ...board().boards,
        {
          id: 'child-2',
          title: 'Second',
          status: 'active',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    const result = duplicateBoardNodes(
      [boardCard('bn1', 'child-1'), boardCard('bn2', 'child-2')],
      b,
      40,
    )

    expect(result.boards).toHaveLength(2)
    expect(result.newBoardNodeCards).toHaveLength(2)
    expect(new Set(result.boards.map((meta) => meta.id)).size).toBe(2)
  })

  it('returns empty results for an empty input', () => {
    const result = duplicateBoardNodes([], board(), 40)
    expect(result).toEqual({
      boards: [],
      nodes: [],
      edges: [],
      newBoardNodeCards: [],
    })
  })
})
