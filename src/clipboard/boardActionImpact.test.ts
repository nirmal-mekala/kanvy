import { describe, expect, it } from 'vitest'
import type { Node } from '../schema/node'
import { computeBoardActionImpact } from './boardActionImpact'

function node(id: string, boardId: string): Node {
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
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('computeBoardActionImpact', () => {
  it('counts content nodes across every referenced board', () => {
    const allNodes = [
      node('a', 'child-1'),
      node('b', 'child-1'),
      node('c', 'child-2'),
      node('d', 'root'),
    ]
    expect(computeBoardActionImpact(['child-1', 'child-2'], allNodes)).toEqual({
      boardCount: 2,
      nodeCount: 3,
    })
  })

  it('does not double count or include unrelated boards', () => {
    const allNodes = [node('a', 'child-1'), node('b', 'root')]
    expect(computeBoardActionImpact(['child-1'], allNodes)).toEqual({
      boardCount: 1,
      nodeCount: 1,
    })
  })

  it('is zero for a board with no content', () => {
    expect(computeBoardActionImpact(['empty-board'], [])).toEqual({
      boardCount: 1,
      nodeCount: 0,
    })
  })
})
