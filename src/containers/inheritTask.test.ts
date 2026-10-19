import { describe, expect, it } from 'vitest'
import type { CardNode, ContainerNode, Node, TaskField } from '../schema/node'
import { immediateEnclosingContainer } from './containment'
import { computeDropTaskInheritance, inheritEnclosingTask } from './inheritTask'

const STAMP = '2026-01-01T00:00:00.000Z'

function box(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  task: TaskField = 'none',
): ContainerNode {
  return {
    ...{ id, x, y, w, h, task },
    boardId: 'b0ard0000000',
    nodeType: 'container',
    pattern: 'none',
    color: 'gray',
    status: 'active',
    position: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
  }
}

function card(
  id: string,
  x: number,
  y: number,
  task: TaskField = 'none',
): CardNode {
  return {
    ...{ id, x, y, task },
    w: 40,
    h: 40,
    boardId: 'b0ard0000000',
    nodeType: 'card',
    cardType: 'text',
    size: 'regular',
    color: 'gray',
    status: 'active',
    position: 0,
    content: '',
    createdAt: STAMP,
    updatedAt: STAMP,
  }
}

/** `nodes` with `ids` shifted by (dx, dy) — what a drag leaves behind. */
function moved(
  nodes: readonly Node[],
  ids: readonly string[],
  dx: number,
  dy: number,
): Node[] {
  return nodes.map((node) =>
    ids.includes(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node,
  )
}

describe('immediateEnclosingContainer', () => {
  it('picks the smallest container that fully encloses the node', () => {
    const nodes = [box('outer', 0, 0, 400, 400), box('inner', 50, 50, 200, 200)]
    expect(immediateEnclosingContainer(card('c', 60, 60), nodes)?.id).toBe(
      'inner',
    )
  })

  it('ignores a container the node only partially overlaps', () => {
    const nodes = [box('outer', 0, 0, 400, 400), box('inner', 50, 50, 100, 100)]
    expect(immediateEnclosingContainer(card('c', 130, 60), nodes)?.id).toBe(
      'outer',
    )
  })

  it('never returns the node itself, and ignores cards', () => {
    const self = box('self', 0, 0, 100, 100)
    expect(
      immediateEnclosingContainer(self, [self, card('c', -10, -10)]),
    ).toBeUndefined()
  })
})

describe('inheritEnclosingTask', () => {
  it("stamps the immediate parent's status onto a new non-task node", () => {
    const result = inheritEnclosingTask(card('new', 10, 10), [
      box('p', 0, 0, 200, 200, 'blocked'),
    ])
    expect(result.task).toBe('blocked')
  })

  it('leaves the node unchanged when the immediate parent is not a task, even inside a task grandparent', () => {
    const fresh = card('new', 60, 60)
    const result = inheritEnclosingTask(fresh, [
      box('grand', 0, 0, 400, 400, 'done'),
      box('p', 50, 50, 200, 200),
    ])
    expect(result).toBe(fresh)
  })

  it('leaves the node unchanged outside every container', () => {
    const fresh = card('new', 500, 500)
    expect(
      inheritEnclosingTask(fresh, [box('p', 0, 0, 200, 200, 'todo')]),
    ).toBe(fresh)
  })
})

describe('computeDropTaskInheritance', () => {
  it('converts a non-task card dropped into a task container into a task with its status', () => {
    const before = [box('p', 0, 0, 200, 200, 'in_progress'), card('c', 500, 10)]
    const after = moved(before, ['c'], -490, 0)
    expect(
      computeDropTaskInheritance([{ id: 'c', carriedIds: [] }], before, after),
    ).toEqual(new Map([['c', 'in_progress']]))
  })

  it("overwrites an existing task's status", () => {
    const before = [
      box('p', 0, 0, 200, 200, 'done'),
      card('c', 500, 10, 'todo'),
    ]
    const after = moved(before, ['c'], -490, 0)
    expect(
      computeDropTaskInheritance([{ id: 'c', carriedIds: [] }], before, after),
    ).toEqual(new Map([['c', 'done']]))
  })

  it('does nothing when repositioning within the same parent', () => {
    const before = [box('p', 0, 0, 400, 400, 'todo'), card('c', 10, 10, 'done')]
    const after = moved(before, ['c'], 100, 100)
    expect(
      computeDropTaskInheritance([{ id: 'c', carriedIds: [] }], before, after)
        .size,
    ).toBe(0)
  })

  it('does nothing (never un-tasks) when the new parent is not a task', () => {
    const before = [
      box('from', 0, 0, 200, 200, 'blocked'),
      box('to', 500, 0, 200, 200),
      card('c', 10, 10, 'blocked'),
    ]
    const after = moved(before, ['c'], 500, 0)
    expect(
      computeDropTaskInheritance([{ id: 'c', carriedIds: [] }], before, after)
        .size,
    ).toBe(0)
  })

  it('does nothing when dragged out of a task container onto bare canvas', () => {
    const before = [box('p', 0, 0, 200, 200, 'todo'), card('c', 10, 10)]
    const after = moved(before, ['c'], 1000, 0)
    expect(
      computeDropTaskInheritance([{ id: 'c', carriedIds: [] }], before, after)
        .size,
    ).toBe(0)
  })

  it('only looks at the immediate parent, never a task grandparent', () => {
    const before = [
      box('grand', 0, 0, 400, 400, 'done'),
      box('p', 50, 50, 200, 200),
      card('c', 1000, 0),
    ]
    const after = moved(before, ['c'], -940, 60)
    expect(
      computeDropTaskInheritance([{ id: 'c', carriedIds: [] }], before, after)
        .size,
    ).toBe(0)
  })

  it('moving from one task container to another inherits the new one', () => {
    const before = [
      box('a', 0, 0, 200, 200, 'todo'),
      box('b', 500, 0, 200, 200, 'blocked'),
      card('c', 10, 10, 'todo'),
    ]
    const after = moved(before, ['c'], 500, 0)
    expect(
      computeDropTaskInheritance([{ id: 'c', carriedIds: [] }], before, after),
    ).toEqual(new Map([['c', 'blocked']]))
  })

  it('judges each dropped node by its own new parent', () => {
    const before = [
      box('a', 0, 0, 200, 200, 'todo'),
      box('b', 300, 0, 200, 200, 'done'),
      card('c1', 10, 1000),
      card('c2', 310, 1000),
      card('c3', 1000, 1000),
    ]
    const after = moved(before, ['c1', 'c2', 'c3'], 0, -990)
    const result = computeDropTaskInheritance(
      [
        { id: 'c1', carriedIds: [] },
        { id: 'c2', carriedIds: [] },
        { id: 'c3', carriedIds: [] },
      ],
      before,
      after,
    )
    expect(result).toEqual(
      new Map([
        ['c1', 'todo'],
        ['c2', 'done'],
      ]),
    )
  })

  it("a dragged container's carried contents all inherit along with it, at any depth, even through a non-task inner container", () => {
    const before = [
      box('target', 0, 0, 1000, 1000, 'blocked'),
      box('dragged', 2000, 0, 400, 400),
      box('inner', 2050, 50, 200, 200),
      card('deep', 2060, 60, 'done'),
      card('shallow', 2300, 300),
    ]
    const carriedIds = ['inner', 'deep', 'shallow']
    const after = moved(before, ['dragged', ...carriedIds], -1900, 100)
    expect(
      computeDropTaskInheritance(
        [{ id: 'dragged', carriedIds }],
        before,
        after,
      ),
    ).toEqual(
      new Map([
        ['dragged', 'blocked'],
        ['inner', 'blocked'],
        ['deep', 'blocked'],
        ['shallow', 'blocked'],
      ]),
    )
  })

  it('omits nodes already at the inherited status', () => {
    const before = [
      box('p', 0, 0, 200, 200, 'todo'),
      card('c', 500, 10, 'todo'),
    ]
    const after = moved(before, ['c'], -490, 0)
    expect(
      computeDropTaskInheritance([{ id: 'c', carriedIds: [] }], before, after)
        .size,
    ).toBe(0)
  })
})
