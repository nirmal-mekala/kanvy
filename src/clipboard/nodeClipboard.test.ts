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

describe('node clipboard paste offset', () => {
  it("the very first paste doesn't land exactly on top of the original (spec §7's staircase)", () => {
    const store = createStore()
    store.set(copyToNodeClipboardAtom, [textNode('a', 100, 100)])

    const [pasted] = store.set(pasteFromNodeClipboardAtom, [])

    expect(pasted?.x).not.toBe(100)
    expect(pasted?.y).not.toBe(100)
  })

  it('each successive paste of the same copy lands further out (staircase)', () => {
    const store = createStore()
    store.set(copyToNodeClipboardAtom, [textNode('a', 100, 100)])

    const [first] = store.set(pasteFromNodeClipboardAtom, [])
    const [second] = store.set(pasteFromNodeClipboardAtom, [])

    expect(second?.x).toBeGreaterThan(first?.x ?? 0)
    expect(second?.y).toBeGreaterThan(first?.y ?? 0)
  })
})
