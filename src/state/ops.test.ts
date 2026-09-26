import { describe, expect, it } from 'vitest'
import type { Board } from '../schema/board'
import { SCHEMA_VERSION } from '../schema/board'
import type { Node } from '../schema/node'
import { applyOps, mergeOpLists, type Op } from './ops'

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

describe('applyOps', () => {
  it('create + after appends the entity; + before removes it by id', () => {
    const op: Op = { kind: 'create', entity: 'node', value: node('n1') }
    const board = emptyBoard()
    const created = applyOps(board, [op], 'after')
    expect(created.nodes.map((n) => n.id)).toEqual(['n1'])
    const reverted = applyOps(created, [op], 'before')
    expect(reverted.nodes).toEqual([])
  })

  it('update + after merges `after`; + before merges `before`', () => {
    const board = emptyBoard({ nodes: [node('n1', { x: 0, y: 0 })] })
    const op: Op = {
      kind: 'update',
      entity: 'node',
      id: 'n1',
      before: { x: 0, y: 0 },
      after: { x: 10, y: 20 },
    }
    const after = applyOps(board, [op], 'after')
    expect(after.nodes[0]).toMatchObject({ x: 10, y: 20 })
    const before = applyOps(after, [op], 'before')
    expect(before.nodes[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('image op sets/removes an images entry', () => {
    const board = emptyBoard()
    const op: Op = {
      kind: 'image',
      id: 'img1',
      before: undefined,
      after: 'data:x',
    }
    const after = applyOps(board, [op], 'after')
    expect(after.images).toEqual([{ id: 'img1', dataUri: 'data:x' }])
    const before = applyOps(after, [op], 'before')
    expect(before.images).toEqual([])
  })

  it('applies a batch of ops in order for `after`, and in reverse order for `before`', () => {
    const board = emptyBoard()
    const ops: Op[] = [
      { kind: 'create', entity: 'node', value: node('n1', { x: 0 }) },
      {
        kind: 'update',
        entity: 'node',
        id: 'n1',
        before: { x: 0 },
        after: { x: 5 },
      },
    ]
    const after = applyOps(board, ops, 'after')
    expect(after.nodes[0]).toMatchObject({ id: 'n1', x: 5 })
    const before = applyOps(after, ops, 'before')
    expect(before.nodes).toEqual([])
  })
})

describe('mergeOpLists', () => {
  it('appends an op targeting a different entity', () => {
    const prev: Op[] = [
      { kind: 'update', entity: 'node', id: 'a', before: {}, after: { x: 1 } },
    ]
    const next: Op[] = [
      { kind: 'update', entity: 'node', id: 'b', before: {}, after: { x: 2 } },
    ]
    expect(mergeOpLists(prev, next)).toEqual([...prev, ...next])
  })

  it('merges two update ops on the same entity, keeping the earliest before and latest after', () => {
    const prev: Op[] = [
      {
        kind: 'update',
        entity: 'node',
        id: 'a',
        before: { x: 0 },
        after: { x: 5 },
      },
    ]
    const next: Op[] = [
      {
        kind: 'update',
        entity: 'node',
        id: 'a',
        before: { x: 5 },
        after: { x: 10 },
      },
    ]
    expect(mergeOpLists(prev, next)).toEqual([
      {
        kind: 'update',
        entity: 'node',
        id: 'a',
        before: { x: 0 },
        after: { x: 10 },
      },
    ])
  })

  it('folds an update into a preceding create for the same entity', () => {
    const created = node('a', { x: 0 })
    const prev: Op[] = [{ kind: 'create', entity: 'node', value: created }]
    const next: Op[] = [
      {
        kind: 'update',
        entity: 'node',
        id: 'a',
        before: { x: 0 },
        after: { x: 9 },
      },
    ]
    const merged = mergeOpLists(prev, next)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual({
      kind: 'create',
      entity: 'node',
      value: { ...created, x: 9 },
    })
  })

  it('merges two image ops on the same id, keeping the earliest before', () => {
    const prev: Op[] = [
      { kind: 'image', id: 'img1', before: undefined, after: 'a' },
    ]
    const next: Op[] = [{ kind: 'image', id: 'img1', before: 'a', after: 'b' }]
    expect(mergeOpLists(prev, next)).toEqual([
      { kind: 'image', id: 'img1', before: undefined, after: 'b' },
    ])
  })
})
