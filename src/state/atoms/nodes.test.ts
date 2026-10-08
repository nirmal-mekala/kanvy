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

function linkNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    boardId: 'h0me0b0ard00',
    nodeType: 'card',
    cardType: 'link',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    task: 'none',
    status: 'active',
    position: 0,
    link: { url: 'https://example.com', status: 'loading' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Node
}

function textNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    boardId: 'h0me0b0ard00',
    nodeType: 'card',
    cardType: 'text',
    size: 'regular',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    task: 'none',
    status: 'active',
    position: 0,
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
  const liveBoardModule = await import('../history/liveBoard')
  const selectionModule = await import('./selection')
  const currentBoardModule = await import('./currentBoard')
  const boardsModule = await import('./boards')
  const networkReconcileModule = await import('../networkReconcile')
  const store = createStore()
  return {
    store,
    ...nodesModule,
    ...edgesModule,
    ...historyModule,
    ...liveBoardModule,
    ...selectionModule,
    ...currentBoardModule,
    ...boardsModule,
    ...networkReconcileModule,
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

  it.each([
    ['h1', 96], // HEADING_DEFAULT_H.h1 — fits one 3rem line
    ['h2', 80], // HEADING_DEFAULT_H.h2 — fits one 2.25rem line
    ['h3', 80], // HEADING_DEFAULT_H.h3 — fits one 1.75rem line (same grid step as h2)
  ] as const)(
    "setTextSizeAtom regular → %s seeds that level's default box",
    async (size, expectedH) => {
      const { store, addNodeAtom, setTextSizeAtom, nodeFamily } =
        await freshState()
      store.set(addNodeAtom, textNode('n1', { size: 'regular', w: 224, h: 90 }))

      store.set(setTextSizeAtom, ['n1'], size)

      const node = store.get(nodeFamily('n1'))
      expect(
        node?.nodeType === 'card' && node.cardType === 'text' && node.size,
      ).toBe(size)
      expect(node?.w).toBe(256) // HEADING_DEFAULT_W (GRID_SIZE * 16) — shared across levels
      expect(node?.h).toBe(expectedH)
    },
  )

  it('setTextSizeAtom h1 → h2 relabels size only, preserving the current (user-resized) box', async () => {
    const { store, addNodeAtom, setTextSizeAtom, nodeFamily } =
      await freshState()
    store.set(addNodeAtom, textNode('n1', { size: 'h1', w: 500, h: 400 }))

    store.set(setTextSizeAtom, ['n1'], 'h2')

    const node = store.get(nodeFamily('n1'))
    expect(
      node?.nodeType === 'card' && node.cardType === 'text' && node.size,
    ).toBe('h2')
    expect(node?.w).toBe(500)
    expect(node?.h).toBe(400)
  })

  it('setTextSizeAtom h2 → regular resets width only, leaving height for auto-grow', async () => {
    const { store, addNodeAtom, setTextSizeAtom, nodeFamily } =
      await freshState()
    store.set(addNodeAtom, textNode('n1', { size: 'h2', w: 500, h: 400 }))

    store.set(setTextSizeAtom, ['n1'], 'regular')

    const node = store.get(nodeFamily('n1'))
    expect(
      node?.nodeType === 'card' && node.cardType === 'text' && node.size,
    ).toBe('regular')
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
    store.set(
      addNodeAtom,
      textNode('n1', { cardType: 'image', imageId: 'img1' }),
    )
    const before = store.get(boardAtom)

    store.set(setTextSizeAtom, ['n1'], 'h1')

    expect(store.get(boardAtom)).toBe(before)
  })

  it('removeEntitiesAtom tombstones a node and its edges (but not a spatially-contained survivor, per spec §2.3 v0.1/Q2: no cascade)', async () => {
    const { store, addNodeAtom, addEdgeAtom, removeEntitiesAtom, boardAtom } =
      await freshState()

    const container: Node = {
      id: 'container1',
      boardId: 'h0me0b0ard00',
      nodeType: 'container',
      pattern: 'none',
      x: 0,
      y: 0,
      w: 128,
      h: 96,
      color: 'gray',
      task: 'none',
      status: 'active',
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const child = textNode('child1')
    store.set(addNodeAtom, container)
    store.set(addNodeAtom, child)
    store.set(addEdgeAtom, {
      id: 'e1',
      boardId: 'h0me0b0ard00',
      fromNodeId: 'container1',
      fromSide: 'right',
      toNodeId: 'child1',
      toSide: 'left',
      direction: 'none',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    store.set(removeEntitiesAtom, ['container1'])

    const board = store.get(boardAtom)
    expect(board.nodes.find((n) => n.id === 'container1')?.status).toBe(
      'trashed',
    )
    expect(board.nodes.find((n) => n.id === 'child1')?.status).toBe('active')
    expect(board.edges.every((e) => e.status === 'trashed')).toBe(true)
  })

  it("setTaskKindAtom makes a node a task (todo), then un-tasks it back to 'none'", async () => {
    const { store, addNodeAtom, setTaskKindAtom, nodeFamily } =
      await freshState()
    store.set(addNodeAtom, textNode('n1'))

    store.set(setTaskKindAtom, ['n1'], 'task')
    expect(store.get(nodeFamily('n1'))?.task).toBe('todo')

    store.set(setTaskKindAtom, ['n1'], 'default')
    expect(store.get(nodeFamily('n1'))?.task).toBe('none')
  })

  it('treats task \'none\' as "not a task" in both task atoms', async () => {
    const {
      store,
      addNodeAtom,
      setTaskKindAtom,
      setTaskStatusAtom,
      boardAtom,
    } = await freshState()
    store.set(addNodeAtom, textNode('n1'))
    const before = store.get(boardAtom)

    store.set(setTaskStatusAtom, ['n1'], 'done')
    store.set(setTaskKindAtom, ['n1'], 'default')

    expect(store.get(boardAtom)).toBe(before)
  })

  it("records a concrete before/after task value (never a missing key), so undo restores 'none' via a real PATCH value", async () => {
    const {
      store,
      addNodeAtom,
      setTaskKindAtom,
      undoBoardAtom,
      boardHistoryAtom,
      nodeFamily,
    } = await freshState()
    store.set(addNodeAtom, textNode('n1'))
    vi.advanceTimersByTime(10_000) // past the history coalescing window

    store.set(setTaskKindAtom, ['n1'], 'task')
    const ops = store.get(boardHistoryAtom).present.state.ops
    expect(ops).toContainEqual(
      expect.objectContaining({
        kind: 'update',
        id: 'n1',
        before: expect.objectContaining({ task: 'none' }),
        after: expect.objectContaining({ task: 'todo' }),
      }),
    )

    store.set(undoBoardAtom)
    expect(store.get(nodeFamily('n1'))?.task).toBe('none')
  })

  it('setTaskStatusAtom sets a bare status, leaving an already-task node idempotent under setTaskKindAtom', async () => {
    const {
      store,
      addNodeAtom,
      setTaskKindAtom,
      setTaskStatusAtom,
      nodeFamily,
    } = await freshState()
    store.set(addNodeAtom, textNode('n1', { task: 'todo' }))

    store.set(setTaskStatusAtom, ['n1'], 'blocked')
    store.set(setTaskKindAtom, ['n1'], 'task')

    expect(store.get(nodeFamily('n1'))?.task).toBe('blocked')
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
    store.set(currentBoardIdAtom, undefined)
    expect(store.get(nodeIdsAtom)).toContain('root-1')
    expect(store.get(nodeIdsAtom)).not.toContain('child-1')
  })

  it('addNodeAtom stamps the current board onto the new node, overriding whatever the caller constructed it with', async () => {
    const { store, addNodeAtom, boardAtom, currentBoardIdAtom } =
      await freshState()
    store.set(currentBoardIdAtom, 'child')
    store.set(addNodeAtom, textNode('n1', { boardId: 'h0me0b0ard00' }))

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
      boardId: 'h0me0b0ard00',
      fromNodeId: 'a',
      fromSide: 'right',
      toNodeId: 'b',
      toSide: 'left',
      direction: 'none',
      status: 'active',
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
      boardId: 'h0me0b0ard00',
      fromNodeId: 'a',
      fromSide: 'right',
      toNodeId: 'b',
      toSide: 'left',
      direction: 'none',
      status: 'active',
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
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(store.get(edgeIdsAtom)).toEqual(['child-edge'])
    store.set(currentBoardIdAtom, undefined)
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
    store.set(currentBoardIdAtom, undefined)
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

    store.set(currentBoardIdAtom, undefined)
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
    store.set(currentBoardIdAtom, undefined)
    store.set(undoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 2)

    // child's own last action is on top: its undo works normally.
    store.set(currentBoardIdAtom, 'child')
    store.set(undoBoardAtom)
    expect(store.get(boardAtom).nodes).toHaveLength(initialCount + 1)
  })
})

describe("removeEntitiesAtom tombstones a board node's referenced board (multiboard support design doc §2/§4)", () => {
  function boardCard(id: string, boardRef: string): Node {
    return {
      ...textNode(id),
      nodeType: 'card',
      cardType: 'board',
      boardRef,
      content: '',
    } as Node
  }

  it("deleting a board node tombstones it and flips its referenced board's status to trashed", async () => {
    const {
      store,
      addNodeAtom,
      removeEntitiesAtom,
      boardAtom,
      currentBoardAtom,
    } = await freshState()
    const before = store.get(boardAtom)
    store.set(currentBoardAtom, {
      ...before,
      boards: [
        ...before.boards,
        {
          id: 'child-1',
          title: 'Untitled board',
          status: 'active' as const,
          isRoot: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    store.set(addNodeAtom, boardCard('bn1', 'child-1'))

    store.set(removeEntitiesAtom, ['bn1'])

    const board = store.get(boardAtom)
    expect(board.nodes.find((n) => n.id === 'bn1')?.status).toBe('trashed')
    expect(board.boards.find((b) => b.id === 'child-1')?.status).toBe('trashed')
  })

  it('never trashes the root board, even via a board node that (through a hand-edited document) points at it', async () => {
    const {
      store,
      addNodeAtom,
      removeEntitiesAtom,
      boardAtom,
      rootBoardIdAtom,
    } = await freshState()
    const rootId = store.get(rootBoardIdAtom)
    store.set(addNodeAtom, boardCard('bn-root', rootId))

    store.set(removeEntitiesAtom, ['bn-root'])

    const board = store.get(boardAtom)
    expect(board.nodes.find((n) => n.id === 'bn-root')?.status).toBe('trashed')
    expect(board.boards.find((b) => b.id === rootId)?.status).toBe('active')
  })

  it('leaves other boards untouched when deleting an unrelated (non-board) node', async () => {
    const { store, addNodeAtom, removeEntitiesAtom, boardAtom } =
      await freshState()
    store.set(addNodeAtom, textNode('n1'))
    const boardsBefore = store.get(boardAtom).boards

    store.set(removeEntitiesAtom, ['n1'])

    expect(store.get(boardAtom).boards).toEqual(boardsBefore)
  })

  it("undoing the delete restores both the board-node and its board's active status, in one step", async () => {
    const {
      store,
      addNodeAtom,
      removeEntitiesAtom,
      undoBoardAtom,
      boardAtom,
      currentBoardAtom,
    } = await freshState()
    const before = store.get(boardAtom)
    store.set(currentBoardAtom, {
      ...before,
      boards: [
        ...before.boards,
        {
          id: 'child-1',
          title: 'Untitled board',
          status: 'active' as const,
          isRoot: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    store.set(addNodeAtom, boardCard('bn1', 'child-1'))

    // Advance past the 400ms coalescing window so the delete is its own
    // undo step, not merged with the setup above.
    vi.advanceTimersByTime(1000)
    store.set(removeEntitiesAtom, ['bn1'])
    expect(
      store.get(boardAtom).boards.find((b) => b.id === 'child-1')?.status,
    ).toBe('trashed')

    store.set(undoBoardAtom)
    const restored = store.get(boardAtom)
    expect(restored.nodes.find((n) => n.id === 'bn1')).toBeDefined()
    expect(restored.boards.find((b) => b.id === 'child-1')?.status).toBe(
      'active',
    )
  })

  it('updateLinkAtom patches the link card matching the given id', async () => {
    const { store, addNodeAtom, updateLinkAtom, boardAtom } = await freshState()
    store.set(addNodeAtom, linkNode('link-1'))
    store.set(updateLinkAtom, 'link-1', { status: 'ready', title: 'Example' })
    const node = store.get(boardAtom).nodes.find((n) => n.id === 'link-1')
    expect(
      node?.nodeType === 'card' && node.cardType === 'link' && node.link,
    ).toEqual({
      url: 'https://example.com',
      status: 'ready',
      title: 'Example',
    })
  })

  // Regression test: a link card's metadata fetch (src/cards/
  // applyLinkMetadata.ts) captures the node's id in a closure before the
  // fetch settles. In Network mode, that local id can be reconciled to a
  // server-assigned one in the meantime (ctx/notes/
  // 260925-network-id-reconciliation.md) — updateLinkAtom used to look the
  // node up by the stale id and silently no-op, leaving the card stuck on
  // `status: 'loading'` forever.
  it('updateLinkAtom resolves a since-reconciled node id', async () => {
    const {
      store,
      addNodeAtom,
      updateLinkAtom,
      boardAtom,
      reconcileNetworkEntityIdAtom,
    } = await freshState()
    store.set(addNodeAtom, linkNode('server-1'))
    reconcileNetworkEntityIdAtom('node', 'local-1', 'server-1')

    store.set(updateLinkAtom, 'local-1', { status: 'ready', title: 'Example' })

    const node = store.get(boardAtom).nodes.find((n) => n.id === 'server-1')
    expect(
      node?.nodeType === 'card' && node.cardType === 'link' && node.link,
    ).toEqual({
      url: 'https://example.com',
      status: 'ready',
      title: 'Example',
    })
  })
})
