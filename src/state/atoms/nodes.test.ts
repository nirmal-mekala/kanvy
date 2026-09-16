import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Node } from '../../schema/node'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

function textNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
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
    ...overrides,
  } as Node
}

// Every test gets a fresh in-memory localStorage AND fresh atom modules
// (boardHistoryAtom reads localStorage once, at module-import time), since
// jotai atoms and the module-level debounced saver are otherwise
// process-wide singletons that would leak state between tests.
async function freshState() {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.resetModules()
  const nodesModule = await import('./nodes')
  const edgesModule = await import('./edges')
  const historyModule = await import('../history/boardHistoryAtom')
  const selectionModule = await import('./selection')
  const store = createStore()
  return {
    store,
    ...nodesModule,
    ...edgesModule,
    ...historyModule,
    ...selectionModule,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe('nodes atoms', () => {
  it('addNodeAtom appends a node and updateBoardAtom records an undo step', async () => {
    const { store, addNodeAtom, boardAtom } = await freshState()
    const before = store.get(boardAtom).nodes.length
    store.set(addNodeAtom, textNode('n1'))
    expect(store.get(boardAtom).nodes).toHaveLength(before + 1)
  })

  it('nodeFamily(id) only changes reference for the touched node', async () => {
    const { store, addNodeAtom, updateNodeAtom, nodeFamily } =
      await freshState()
    store.set(addNodeAtom, textNode('n1'))
    store.set(addNodeAtom, textNode('n2'))

    const n2Before = store.get(nodeFamily('n2'))
    store.set(updateNodeAtom, 'n1', { color: 'coral' })
    const n2After = store.get(nodeFamily('n2'))

    expect(n2After).toBe(n2Before)
    expect(store.get(nodeFamily('n1'))?.color).toBe('coral')
  })

  it('setNodeHeightAtom updates h without refreshing updatedAt (recency mode must not see a mere render as a touch)', async () => {
    const { store, addNodeAtom, setNodeHeightAtom, nodeFamily } =
      await freshState()
    store.set(
      addNodeAtom,
      textNode('n1', { h: 90, updatedAt: '2026-01-01T00:00:00.000Z' }),
    )
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))

    store.set(setNodeHeightAtom, 'n1', 120)

    const node = store.get(nodeFamily('n1'))
    expect(node?.h).toBe(120)
    expect(node?.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('setNodeHeightAtom is a no-op (no board reference change) when h is unchanged', async () => {
    const { store, addNodeAtom, setNodeHeightAtom, boardAtom } =
      await freshState()
    store.set(addNodeAtom, textNode('n1', { h: 90 }))
    const before = store.get(boardAtom)

    store.set(setNodeHeightAtom, 'n1', 90)

    expect(store.get(boardAtom)).toBe(before)
  })

  it('removeEntitiesAtom drops a node, its edges, and orphaned images, and clears dangling parentId', async () => {
    const { store, addNodeAtom, addEdgeAtom, removeEntitiesAtom, boardAtom } =
      await freshState()

    const container: Node = {
      id: 'container1',
      type: 'container',
      pattern: 'none',
      x: 0,
      y: 0,
      w: 128,
      h: 96,
      color: 'gray',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const child = textNode('child1', { parentId: 'container1' })
    store.set(addNodeAtom, container)
    store.set(addNodeAtom, child)
    store.set(addEdgeAtom, {
      id: 'e1',
      fromNodeId: 'container1',
      fromSide: 'right',
      toNodeId: 'child1',
      toSide: 'left',
      direction: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    store.set(removeEntitiesAtom, ['container1'])

    const board = store.get(boardAtom)
    const ids = board.nodes.map((n) => n.id)
    expect(ids).not.toContain('container1')
    expect(ids).toContain('child1')
    expect(board.nodes.find((n) => n.id === 'child1')?.parentId).toBeUndefined()
    expect(board.edges).toEqual([])
  })

  it('undo restores the prior board and redo re-applies the change', async () => {
    const { store, addNodeAtom, undoBoardAtom, redoBoardAtom, boardAtom } =
      await freshState()
    const initialCount = store.get(boardAtom).nodes.length
    store.set(addNodeAtom, textNode('n1'))
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 1)

    store.set(undoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount)

    store.set(redoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 1)
  })

  it('undoing a delete re-selects the restored ids (spec §8/Q11)', async () => {
    const {
      store,
      addNodeAtom,
      removeEntitiesAtom,
      undoBoardAtom,
      selectionAtom,
    } = await freshState()
    store.set(addNodeAtom, textNode('n1'))
    store.set(removeEntitiesAtom, ['n1'])
    expect(store.get(selectionAtom).size).toBe(0)

    store.set(undoBoardAtom)
    expect([...store.get(selectionAtom)]).toEqual(['n1'])
  })
})
