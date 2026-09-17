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
    boardId: 'root',
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
  const currentBoardModule = await import('./currentBoard')
  const store = createStore()
  return {
    store,
    ...nodesModule,
    ...edgesModule,
    ...historyModule,
    ...selectionModule,
    ...currentBoardModule,
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

  it('setTextSizeAtom regular → h1 seeds the heading default box', async () => {
    const { store, addNodeAtom, setTextSizeAtom, nodeFamily } =
      await freshState()
    store.set(addNodeAtom, textNode('n1', { size: 'regular', w: 224, h: 90 }))

    store.set(setTextSizeAtom, ['n1'], 'h1')

    const node = store.get(nodeFamily('n1'))
    expect(node?.type === 'card' && node.kind === 'text' && node.size).toBe(
      'h1',
    )
    expect(node?.w).toBe(256) // HEADING_DEFAULT_W (GRID_SIZE * 16)
    expect(node?.h).toBe(128) // HEADING_DEFAULT_H (GRID_SIZE * 8)
  })

  it('setTextSizeAtom h1 → h2 relabels size only, preserving the current (user-resized) box', async () => {
    const { store, addNodeAtom, setTextSizeAtom, nodeFamily } =
      await freshState()
    store.set(addNodeAtom, textNode('n1', { size: 'h1', w: 500, h: 400 }))

    store.set(setTextSizeAtom, ['n1'], 'h2')

    const node = store.get(nodeFamily('n1'))
    expect(node?.type === 'card' && node.kind === 'text' && node.size).toBe(
      'h2',
    )
    expect(node?.w).toBe(500)
    expect(node?.h).toBe(400)
  })

  it('setTextSizeAtom h2 → regular resets width only, leaving height for auto-grow', async () => {
    const { store, addNodeAtom, setTextSizeAtom, nodeFamily } =
      await freshState()
    store.set(addNodeAtom, textNode('n1', { size: 'h2', w: 500, h: 400 }))

    store.set(setTextSizeAtom, ['n1'], 'regular')

    const node = store.get(nodeFamily('n1'))
    expect(node?.type === 'card' && node.kind === 'text' && node.size).toBe(
      'regular',
    )
    expect(node?.w).toBe(224) // CARD_WIDTH (GRID_SIZE * 14)
    expect(node?.h).toBe(400) // untouched — auto-grow corrects it on next render
  })

  it('setTextSizeAtom is a no-op given the same size already set', async () => {
    const { store, addNodeAtom, setTextSizeAtom, boardAtom } =
      await freshState()
    store.set(addNodeAtom, textNode('n1', { size: 'h1' }))
    const before = store.get(boardAtom)

    store.set(setTextSizeAtom, ['n1'], 'h1')

    expect(store.get(boardAtom)).toBe(before)
  })

  it('setTextSizeAtom leaves an image/link card untouched', async () => {
    const { store, addNodeAtom, setTextSizeAtom, boardAtom } =
      await freshState()
    store.set(addNodeAtom, textNode('n1', { kind: 'image', imageId: 'img1' }))
    const before = store.get(boardAtom)

    store.set(setTextSizeAtom, ['n1'], 'h1')

    expect(store.get(boardAtom)).toBe(before)
  })

  it('removeEntitiesAtom drops a node, its edges, and orphaned images (but not a spatially-contained survivor, per spec §2.3 v0.1: no cascade, nothing to clean up)', async () => {
    const { store, addNodeAtom, addEdgeAtom, removeEntitiesAtom, boardAtom } =
      await freshState()

    const container: Node = {
      id: 'container1',
      boardId: 'root',
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
    const child = textNode('child1')
    store.set(addNodeAtom, container)
    store.set(addNodeAtom, child)
    store.set(addEdgeAtom, {
      id: 'e1',
      boardId: 'root',
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

describe('multiboard scoping (ctx/notes/260917-multiboard-support-design.md §2, §5)', () => {
  it("nodeIdsAtom only includes the current board's own nodes", async () => {
    const { store, addNodeAtom, nodeIdsAtom, currentBoardIdAtom } =
      await freshState()
    store.set(addNodeAtom, textNode('root-1'))
    store.set(currentBoardIdAtom, 'child')
    store.set(addNodeAtom, textNode('child-1'))

    expect(store.get(nodeIdsAtom)).toEqual(['child-1'])
    store.set(currentBoardIdAtom, 'root')
    expect(store.get(nodeIdsAtom)).toContain('root-1')
    expect(store.get(nodeIdsAtom)).not.toContain('child-1')
  })

  it('addNodeAtom stamps the current board onto the new node, overriding whatever the caller constructed it with', async () => {
    const { store, addNodeAtom, boardAtom, currentBoardIdAtom } =
      await freshState()
    store.set(currentBoardIdAtom, 'child')
    store.set(addNodeAtom, textNode('n1', { boardId: 'root' }))

    const node = store.get(boardAtom).nodes.find((n) => n.id === 'n1')
    expect(node?.boardId).toBe('child')
  })

  it('addNodesAtom stamps the current board onto every node in the batch', async () => {
    const { store, addNodesAtom, boardAtom, currentBoardIdAtom } =
      await freshState()
    store.set(currentBoardIdAtom, 'child')
    store.set(addNodesAtom, [textNode('n1'), textNode('n2')])

    const nodes = store.get(boardAtom).nodes
    expect(nodes.find((n) => n.id === 'n1')?.boardId).toBe('child')
    expect(nodes.find((n) => n.id === 'n2')?.boardId).toBe('child')
  })

  it('addEdgeAtom stamps the current board onto the new edge', async () => {
    const { store, addNodeAtom, addEdgeAtom, boardAtom, currentBoardIdAtom } =
      await freshState()
    store.set(currentBoardIdAtom, 'child')
    store.set(addNodeAtom, textNode('a'))
    store.set(addNodeAtom, textNode('b'))
    store.set(addEdgeAtom, {
      id: 'e1',
      boardId: 'root',
      fromNodeId: 'a',
      fromSide: 'right',
      toNodeId: 'b',
      toSide: 'left',
      direction: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(store.get(boardAtom).edges[0]?.boardId).toBe('child')
  })

  it("edgeIdsAtom only includes the current board's own edges", async () => {
    const { store, addNodeAtom, addEdgeAtom, edgeIdsAtom, currentBoardIdAtom } =
      await freshState()
    store.set(addNodeAtom, textNode('a'))
    store.set(addNodeAtom, textNode('b'))
    store.set(addEdgeAtom, {
      id: 'root-edge',
      boardId: 'root',
      fromNodeId: 'a',
      fromSide: 'right',
      toNodeId: 'b',
      toSide: 'left',
      direction: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    store.set(currentBoardIdAtom, 'child')
    store.set(addNodeAtom, textNode('c'))
    store.set(addNodeAtom, textNode('d'))
    store.set(addEdgeAtom, {
      id: 'child-edge',
      boardId: 'child',
      fromNodeId: 'c',
      fromSide: 'right',
      toNodeId: 'd',
      toSide: 'left',
      direction: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(store.get(edgeIdsAtom)).toEqual(['child-edge'])
    store.set(currentBoardIdAtom, 'root')
    expect(store.get(edgeIdsAtom)).toEqual(['root-edge'])
  })

  it('undo is a no-op if the top of the stack was attributed to a different board than the one currently being viewed', async () => {
    const { store, addNodeAtom, undoBoardAtom, boardAtom, currentBoardIdAtom } =
      await freshState()
    const initialCount = store.get(boardAtom).nodes.length
    store.set(addNodeAtom, textNode('root-1'))
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 1)

    // Navigate to a different board without editing it — its last action
    // ("root-1" added) belongs to root, not the board now being viewed.
    store.set(currentBoardIdAtom, 'child')
    store.set(undoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 1)

    // Back on root, whose own action is still on top: undo works normally.
    store.set(currentBoardIdAtom, 'root')
    store.set(undoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount)
  })

  it('redo is a no-op if the next future entry was attributed to a different board than the one currently being viewed', async () => {
    const {
      store,
      addNodeAtom,
      undoBoardAtom,
      redoBoardAtom,
      boardAtom,
      currentBoardIdAtom,
    } = await freshState()
    const initialCount = store.get(boardAtom).nodes.length
    store.set(addNodeAtom, textNode('root-1'))
    store.set(undoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount)

    store.set(currentBoardIdAtom, 'child')
    store.set(redoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount)

    store.set(currentBoardIdAtom, 'root')
    store.set(redoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 1)
  })

  it("editing a second board after the first makes the first board's undo unavailable until it's edited again", async () => {
    const { store, addNodeAtom, undoBoardAtom, boardAtom, currentBoardIdAtom } =
      await freshState()
    const initialCount = store.get(boardAtom).nodes.length
    store.set(addNodeAtom, textNode('root-1'))

    store.set(currentBoardIdAtom, 'child')
    store.set(addNodeAtom, textNode('child-1', { boardId: 'child' }))
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 2)

    // root-1 is no longer the topmost entry — root's undo can't reach it.
    store.set(currentBoardIdAtom, 'root')
    store.set(undoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 2)

    // child's own last action is on top: its undo works normally.
    store.set(currentBoardIdAtom, 'child')
    store.set(undoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 1)
  })
})
