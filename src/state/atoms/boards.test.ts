import { createStore } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../../schema/board'
import { SCHEMA_VERSION } from '../../schema/board'

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

const now = '2026-01-01T00:00:00.000Z'
const ROOT_ID = 'h0me0b0ard00'

function boardWithChild(): Board {
  return {
    version: SCHEMA_VERSION,
    nodes: [],
    edges: [],
    boards: [
      {
        id: ROOT_ID,
        title: 'Home',
        status: 'active',
        isRoot: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'child-1',
        title: 'Untitled board',
        status: 'active',
        isRoot: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    images: [],
  }
}

// See nodes.test.ts for why each test gets fresh atom modules + localStorage.
async function freshState() {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.resetModules()
  const boardsModule = await import('./boards')
  const historyModule = await import('../history/boardHistoryAtom')
  const liveBoardModule = await import('../history/liveBoard')
  const currentBoardModule = await import('./currentBoard')
  const store = createStore()
  return {
    store,
    ...boardsModule,
    ...historyModule,
    ...liveBoardModule,
    ...currentBoardModule,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe('boardsAtom / boardFamily', () => {
  it('boardsAtom reflects the loaded boards collection', async () => {
    const { store, boardsAtom, currentBoardAtom } = await freshState()
    store.set(currentBoardAtom, boardWithChild())
    expect(store.get(boardsAtom).map((b) => b.id)).toEqual([ROOT_ID, 'child-1'])
  })

  it('boardFamily(id) looks up a single board by id', async () => {
    const { store, boardFamily, currentBoardAtom } = await freshState()
    store.set(currentBoardAtom, boardWithChild())
    expect(store.get(boardFamily('child-1'))?.title).toBe('Untitled board')
    expect(store.get(boardFamily('nonexistent'))).toBeUndefined()
  })
})

describe('rootBoardIdAtom / currentBoardIdAtom', () => {
  it('rootBoardIdAtom is whichever board is isRoot, not a fixed id', async () => {
    const { store, rootBoardIdAtom, currentBoardAtom } = await freshState()
    store.set(currentBoardAtom, boardWithChild())
    expect(store.get(rootBoardIdAtom)).toBe(ROOT_ID)
  })

  it('a fresh seed document has a generated (non-legacy) root id', async () => {
    const { store, rootBoardIdAtom } = await freshState()
    expect(store.get(rootBoardIdAtom)).toMatch(/^[0-9a-z]{12}$/)
    expect(store.get(rootBoardIdAtom)).not.toBe('root')
  })

  it('viewing home (undefined) resolves to the root board', async () => {
    const { store, currentBoardIdAtom, currentBoardAtom } = await freshState()
    store.set(currentBoardAtom, boardWithChild())
    store.set(currentBoardIdAtom, 'child-1')
    expect(store.get(currentBoardIdAtom)).toBe('child-1')
    store.set(currentBoardIdAtom, undefined)
    expect(store.get(currentBoardIdAtom)).toBe(ROOT_ID)
  })

  it('viewing home follows a wholesale document swap (e.g. a mode switch) to the new root', async () => {
    const { store, currentBoardIdAtom, currentBoardAtom } = await freshState()
    store.set(currentBoardAtom, boardWithChild())
    store.set(currentBoardIdAtom, undefined)
    const other = boardWithChild()
    store.set(currentBoardAtom, {
      ...other,
      boards: other.boards.map((b) =>
        b.isRoot ? { ...b, id: 'other0root00' } : b,
      ),
    })
    expect(store.get(currentBoardIdAtom)).toBe('other0root00')
  })
})

describe('renameBoardAtom', () => {
  it('renames the target board, independent of which board is currently being viewed', async () => {
    const { store, boardFamily, renameBoardAtom, currentBoardAtom } =
      await freshState()
    store.set(currentBoardAtom, boardWithChild())

    store.set(renameBoardAtom, 'child-1', 'My board')

    expect(store.get(boardFamily('child-1'))?.title).toBe('My board')
  })

  it('is a no-op for the root board (its title is fixed)', async () => {
    const { store, boardFamily, renameBoardAtom, currentBoardAtom, boardAtom } =
      await freshState()
    store.set(currentBoardAtom, boardWithChild())
    const before = store.get(boardAtom)

    store.set(renameBoardAtom, ROOT_ID, 'New home title')

    expect(store.get(boardFamily(ROOT_ID))?.title).toBe('Home')
    expect(store.get(boardAtom)).toBe(before)
  })

  it('is a no-op given the same title already set (no spurious history step)', async () => {
    const { store, renameBoardAtom, currentBoardAtom, boardAtom } =
      await freshState()
    store.set(currentBoardAtom, boardWithChild())
    const before = store.get(boardAtom)

    store.set(renameBoardAtom, 'child-1', 'Untitled board')

    expect(store.get(boardAtom)).toBe(before)
  })

  it('records an undo step attributed to the current board, regardless of which board was renamed', async () => {
    const {
      store,
      renameBoardAtom,
      currentBoardAtom,
      boardFamily,
      undoBoardAtom,
      currentBoardIdAtom,
    } = await freshState()
    store.set(currentBoardAtom, boardWithChild())

    // Renaming a board-node's target board from root (Sub-phase 4's
    // on-canvas rename) — attribution is root, the board acted *from*.
    vi.advanceTimersByTime(1000)
    store.set(currentBoardIdAtom, ROOT_ID)
    store.set(renameBoardAtom, 'child-1', 'Renamed from root')
    expect(store.get(boardFamily('child-1'))?.title).toBe('Renamed from root')

    store.set(undoBoardAtom)
    expect(store.get(boardFamily('child-1'))?.title).toBe('Untitled board')
  })
})

describe('createBoardAtom', () => {
  it('mints a new boards entry and a board-node referencing it, in one atomic step, while viewing root', async () => {
    const { store, createBoardAtom, boardAtom, rootBoardIdAtom } =
      await freshState()
    const boardsBefore = store.get(boardAtom).boards.length
    const nodesBefore = store.get(boardAtom).nodes.length

    store.set(createBoardAtom, 100, 100)

    const board = store.get(boardAtom)
    const rootId = store.get(rootBoardIdAtom)
    expect(board.boards).toHaveLength(boardsBefore + 1)
    expect(board.nodes).toHaveLength(nodesBefore + 1)

    const newBoardMeta = board.boards.at(-1)
    const newNode = board.nodes.at(-1)
    expect(newBoardMeta?.title).toBe('Untitled board')
    expect(newBoardMeta?.isRoot).toBe(false)
    if (newNode?.nodeType !== 'card' || newNode.cardType !== 'board') {
      throw new Error('expected the new node to be a board card')
    }
    expect(newNode.boardRef).toBe(newBoardMeta?.id)
    expect(newNode.boardId).toBe(rootId)
  })

  it('undoing the creation removes both the boards entry and the board-node together', async () => {
    const { store, createBoardAtom, undoBoardAtom, boardAtom } =
      await freshState()
    const before = store.get(boardAtom)

    store.set(createBoardAtom, 100, 100)
    store.set(undoBoardAtom)

    expect(store.get(boardAtom)).toEqual(before)
  })

  it("a locally-created board's id is stable across a save/reload round trip — local mode's write never reassigns the id it minted (ctx/notes/260925-network-id-reconciliation.md: unlike network mode, there's no reconciliation step for local mode because none is ever needed)", async () => {
    const { store, createBoardAtom, boardAtom } = await freshState()

    store.set(createBoardAtom, 100, 100)
    const mintedId = store.get(boardAtom).boards.at(-1)?.id

    // Flush the debounced autosave (500ms) so it actually writes to
    // localStorage, then reload from scratch the same way a real page
    // load would.
    vi.advanceTimersByTime(1000)
    const storageModule = await import('../persistence/storage')
    const reloaded = storageModule.loadBoard()

    expect(reloaded.ok).toBe(true)
    expect(reloaded.board.boards.at(-1)?.id).toBe(mintedId)
  })

  it('is a no-op anywhere but the home board', async () => {
    const { store, createBoardAtom, currentBoardIdAtom, boardAtom } =
      await freshState()
    store.set(currentBoardIdAtom, 'some-other-board')
    const before = store.get(boardAtom)

    store.set(createBoardAtom, 100, 100)

    expect(store.get(boardAtom)).toBe(before)
  })
})

describe('duplicateBoardNodesAtom', () => {
  it("duplicates a board node's referenced board, appending everything in one step", async () => {
    const { store, createBoardAtom, duplicateBoardNodesAtom, boardAtom } =
      await freshState()
    store.set(createBoardAtom, 100, 100)
    const board = store.get(boardAtom)
    const boardCard = board.nodes.at(-1)
    if (boardCard?.nodeType !== 'card' || boardCard.cardType !== 'board') {
      throw new Error('expected a board card')
    }
    const boardsBefore = board.boards.length
    const nodesBefore = board.nodes.length

    const result = store.set(duplicateBoardNodesAtom, [boardCard], 40)

    expect(result).toHaveLength(1)
    const after = store.get(boardAtom)
    expect(after.boards).toHaveLength(boardsBefore + 1)
    expect(after.nodes).toHaveLength(nodesBefore + 1)
    expect(result[0]?.boardRef).not.toBe(boardCard.boardRef)
    expect(after.boards.at(-1)?.isRoot).toBe(false)
    expect(result[0]?.x).toBe(boardCard.x + 40)
  })

  it('is a no-op given no board nodes', async () => {
    const { store, duplicateBoardNodesAtom, boardAtom } = await freshState()
    const before = store.get(boardAtom)

    const result = store.set(duplicateBoardNodesAtom, [], 40)

    expect(result).toEqual([])
    expect(store.get(boardAtom)).toBe(before)
  })

  it('undoing the duplication removes the new board and its board-node together', async () => {
    const {
      store,
      createBoardAtom,
      duplicateBoardNodesAtom,
      undoBoardAtom,
      boardAtom,
    } = await freshState()
    store.set(createBoardAtom, 100, 100)
    const boardCard = store.get(boardAtom).nodes.at(-1)
    if (boardCard?.nodeType !== 'card' || boardCard.cardType !== 'board') {
      throw new Error('expected a board card')
    }
    vi.advanceTimersByTime(1000)
    const before = store.get(boardAtom)

    store.set(duplicateBoardNodesAtom, [boardCard], 40)
    store.set(undoBoardAtom)

    expect(store.get(boardAtom)).toEqual(before)
  })
})
