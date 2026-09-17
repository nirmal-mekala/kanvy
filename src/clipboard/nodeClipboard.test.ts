import { createStore } from 'jotai'
import { describe, expect, it } from 'vitest'
import type { Node } from '../schema/node'
import {
  copyToNodeClipboardAtom,
  pasteFromNodeClipboardAtom,
} from './nodeClipboard'

function textNode(id: string, x: number, y: number): Node {
  return {
    id,
    boardId: 'root',
    type: 'card',
    kind: 'text',
    size: 'regular',
    x,
    y,
    w: 224,
    h: 90,
    color: 'gray',
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function containerNode(id: string, x: number, y: number): Node {
  return {
    id,
    boardId: 'root',
    type: 'container',
    pattern: 'none',
    color: 'gray',
    x,
    y,
    w: 200,
    h: 200,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function boardCard(id: string, boardRef: string, x = 100, y = 100): Node {
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('node clipboard paste offset', () => {
  it("the very first paste doesn't land exactly on top of the original (spec §7's staircase)", () => {
    const store = createStore()
    store.set(copyToNodeClipboardAtom, [textNode('a', 100, 100)])

    const [pasted] = store.set(pasteFromNodeClipboardAtom, []).pastedNodes

    expect(pasted?.x).not.toBe(100)
    expect(pasted?.y).not.toBe(100)
  })

  it('each successive paste of the same copy lands further out (staircase)', () => {
    const store = createStore()
    store.set(copyToNodeClipboardAtom, [textNode('a', 100, 100)])

    const [first] = store.set(pasteFromNodeClipboardAtom, []).pastedNodes
    const [second] = store.set(pasteFromNodeClipboardAtom, []).pastedNodes

    expect(second?.x).toBeGreaterThan(first?.x ?? 0)
    expect(second?.y).toBeGreaterThan(first?.y ?? 0)
  })
})

describe('node clipboard paste preserves relative spatial arrangement within the copied set', () => {
  it('a container and its spatially-contained card shift by the identical offset, so containment survives the paste with fresh ids', () => {
    const store = createStore()
    const container = containerNode('c1', 100, 100)
    const child = textNode('k1', 130, 130)
    store.set(copyToNodeClipboardAtom, [container, child])

    const pasted = store.set(pasteFromNodeClipboardAtom, []).pastedNodes
    const pastedContainer = pasted.find((n) => n.type === 'container')
    const pastedChild = pasted.find((n) => n.type === 'card')
    if (!pastedContainer || !pastedChild) throw new Error('missing node')

    expect(pastedContainer.id).not.toBe('c1')
    expect(pastedChild.id).not.toBe('k1')
    // Same offset applied to both — relative position (30, 30) preserved,
    // so the child is still spatially inside the container after pasting.
    const offsetX = pastedContainer.x - container.x
    const offsetY = pastedContainer.y - container.y
    expect(pastedChild.x - child.x).toBe(offsetX)
    expect(pastedChild.y - child.y).toBe(offsetY)
    expect(pastedChild.x).toBeGreaterThanOrEqual(pastedContainer.x)
    expect(pastedChild.y).toBeGreaterThanOrEqual(pastedContainer.y)
  })

  it('preserves relative offsets across a three-level chain of copied nodes', () => {
    const store = createStore()
    const grandparent = containerNode('gp', 0, 0)
    const parent = containerNode('p', 20, 20)
    const child = textNode('k', 40, 40)
    store.set(copyToNodeClipboardAtom, [grandparent, parent, child])

    // pasteFromNodeClipboardAtom maps in the same order it was given, so
    // index position matches the original [grandparent, parent, child] order.
    const [pastedGp, pastedParent, pastedChild] = store.set(
      pasteFromNodeClipboardAtom,
      [],
    ).pastedNodes
    if (!pastedGp || !pastedParent || !pastedChild) {
      throw new Error('missing node')
    }

    const offsetX = pastedGp.x - grandparent.x
    const offsetY = pastedGp.y - grandparent.y
    expect(pastedParent.x - parent.x).toBe(offsetX)
    expect(pastedParent.y - parent.y).toBe(offsetY)
    expect(pastedChild.x - child.x).toBe(offsetX)
    expect(pastedChild.y - child.y).toBe(offsetY)
  })
})

describe('node clipboard paste splits out board-kind nodes (multiboard support design doc §2)', () => {
  it('excludes board cards from pastedNodes, returning them separately with the same offset', () => {
    const store = createStore()
    const card = boardCard('bn1', 'child-1')
    store.set(copyToNodeClipboardAtom, [card])

    const result = store.set(pasteFromNodeClipboardAtom, [])

    expect(result.pastedNodes).toEqual([])
    expect(result.boardNodes).toEqual([card])
    expect(result.offset).toBeGreaterThan(0)
  })

  it('pastes a mixed copy, splitting the board card out while copying the rest normally', () => {
    const store = createStore()
    const text = textNode('a', 100, 100)
    const card = boardCard('bn1', 'child-1', 100, 100)
    store.set(copyToNodeClipboardAtom, [text, card])

    const result = store.set(pasteFromNodeClipboardAtom, [])

    expect(result.pastedNodes).toHaveLength(1)
    expect(result.pastedNodes[0]?.id).not.toBe('a')
    expect(result.boardNodes).toEqual([card])
    // Both groups share the same offset, so a mixed paste displaces as
    // one visual unit — pastedNodes already had it applied internally;
    // boardNodes is returned un-offset for the caller to apply itself.
    expect(result.pastedNodes[0]?.x).toBe(text.x + result.offset)
  })
})
