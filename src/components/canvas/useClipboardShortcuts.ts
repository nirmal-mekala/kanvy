// The rest of spec §7's paste priority order (in-app node clipboard, plain
// OS-clipboard text as a new card) plus spec §4.2's remaining keyboard
// shortcuts not already owned by another hook: undo/redo, ⌘/Ctrl+N (new
// card), ⌘/Ctrl+D (duplicate), ⌘/Ctrl+C (copy — in-app + system-clipboard
// text), Backspace/Delete. Image/URL-on-clipboard paste (the two highest-
// priority branches) already live in useCardCreation.ts (Stage 6) — this
// hook's `paste` listener only runs its own branches when that one left
// the event unhandled (`e.defaultPrevented` stays false).
//
// Multiboard support (design doc §4): deleting, duplicating, or pasting
// any `board`-kind node is gated behind a blocking confirm modal — a
// board node standing in for a whole subtree means the on-screen
// selection count understates the real effect. This hook exposes
// `pendingConfirm`/`confirmPending`/`cancelPending` rather than rendering
// the modal itself (it's a hook, not a component); Canvas.tsx renders
// `<ConfirmModal>` from that state.

import { useAtomValue, useSetAtom } from 'jotai'
import type { RefObject } from 'react'
import { useEffect, useState } from 'react'
import { newTextCard } from '../../cards/newCard'
import { computeBoardActionImpact } from '../../clipboard/boardActionImpact'
import { isEditableTarget } from '../../clipboard/dom'
import { duplicateNodes } from '../../clipboard/duplicateNodes'
import {
  copyToNodeClipboardAtom,
  hasNodeClipboardContentAtom,
  nodeClipboardContentsAtom,
  pasteFromNodeClipboardAtom,
} from '../../clipboard/nodeClipboard'
import { panIntoView } from '../../clipboard/panIntoView'
import { computePasteOffset } from '../../clipboard/pasteOffset'
import {
  selectionTextForSystemClipboard,
  writeTextToSystemClipboard,
} from '../../clipboard/systemClipboard'
import { boundingBox } from '../../geometry/containment'
import type { Rect } from '../../geometry/snap'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import type { BoardCard, Node, NodeId } from '../../schema/node'
import { duplicateBoardNodesAtom } from '../../state/atoms/boards'
import { currentBoardIdAtom } from '../../state/atoms/currentBoard'
import { focusNodeIdAtom } from '../../state/atoms/focus'
import { addNodesAtom, removeEntitiesAtom } from '../../state/atoms/nodes'
import { selectionAtom, setSelectionAtom } from '../../state/atoms/selection'
import {
  boardAtom,
  redoBoardAtom,
  undoBoardAtom,
} from '../../state/history/boardHistoryAtom'
import type { View } from './viewportCoords'
import { worldPoint } from './viewportCoords'

/** A blocking confirm the caller must resolve (confirm or cancel) before the underlying board delete/duplicate/paste runs — see this module's own doc comment. */
// fallow-ignore-next-line unused-type
export interface PendingBoardConfirm {
  title: string
  confirmLabel: string
  run: () => void
}

function isBoardCard(node: Node): node is BoardCard {
  return node.type === 'card' && node.kind === 'board'
}

/** Design doc §4's copy pattern — "Delete 3 boards (47 nodes total)?" — shared across delete/duplicate/paste, which only differ in verb. */
function boardConfirmCopy(
  verb: string,
  boardRefs: readonly string[],
  allNodes: readonly Node[],
): { title: string } {
  const { boardCount, nodeCount } = computeBoardActionImpact(
    boardRefs,
    allNodes,
  )
  const boards = boardCount === 1 ? 'board' : 'boards'
  const nodesWord = nodeCount === 1 ? 'node' : 'nodes'
  return {
    title: `${verb} ${boardCount} ${boards} (${nodeCount} ${nodesWord} total)?`,
  }
}

// CRAP scoring penalizes this hook for high cognitive complexity — it's a
// straightforward accretion of independent keyboard-shortcut handlers
// (spec §4.2/§7 plus multiboard support's confirm-modal gating), each
// individually simple; splitting them into separate hooks would mostly
// relocate the complexity, not reduce it, and would need to thread
// `pendingConfirm` state across all of them regardless. Real coverage
// comes from e2e (e2e/clipboard.spec.ts, e2e/multiboard.spec.ts), which
// fallow's static analysis can't see.
// fallow-ignore-next-line complexity
export function useClipboardShortcuts({
  nodes,
  nodesById,
  view,
  setView,
  boardElRef,
}: {
  nodes: readonly Node[]
  nodesById: ReadonlyMap<NodeId, Node>
  view: View
  setView: (updater: (view: View) => View) => void
  boardElRef: RefObject<HTMLDivElement | null>
}) {
  const selection = useAtomValue(selectionAtom)
  const hasNodeClipboardContent = useAtomValue(hasNodeClipboardContentAtom)
  const nodeClipboardContents = useAtomValue(nodeClipboardContentsAtom)
  const addNodes = useSetAtom(addNodesAtom)
  const removeEntities = useSetAtom(removeEntitiesAtom)
  const copyToNodeClipboard = useSetAtom(copyToNodeClipboardAtom)
  const pasteFromNodeClipboard = useSetAtom(pasteFromNodeClipboardAtom)
  const duplicateBoardNodes = useSetAtom(duplicateBoardNodesAtom)
  const setSelection = useSetAtom(setSelectionAtom)
  const setFocusNodeId = useSetAtom(focusNodeIdAtom)
  const undo = useSetAtom(undoBoardAtom)
  const redo = useSetAtom(redoBoardAtom)
  const currentBoardId = useAtomValue(currentBoardIdAtom)
  // Root only ever creates `board`/`container` nodes — text/image/link
  // creation paths are disabled there (multiboard support design doc §3).
  const isRoot = currentBoardId === ROOT_BOARD_ID
  // The confirm modal's "hidden cost" copy (design doc §4) needs every
  // board's content counted, not just the current board's own — `nodes`
  // (this hook's prop) is already scoped to the current board by
  // Canvas.tsx, which is wrong for e.g. a board node whose *contents*
  // live entirely on a different board's boardId.
  const allNodes = useAtomValue(boardAtom).nodes
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingBoardConfirm | null>(null)

  function confirmPending() {
    pendingConfirm?.run()
    setPendingConfirm(null)
  }
  function cancelPending() {
    setPendingConfirm(null)
  }

  function containerRects(): Rect[] {
    return nodes
      .filter((node) => node.type === 'container')
      .map((node) => ({ x: node.x, y: node.y, w: node.w, h: node.h }))
  }

  // Shared by paste and ⌘/Ctrl+D duplicate (spec §7's "snap to what just
  // landed" behavior) — whatever new nodes just got added, pan the
  // viewport to keep them fully visible without changing zoom.
  function panNewNodesIntoView(newNodes: readonly Node[]) {
    const rect = boardElRef.current?.getBoundingClientRect()
    if (!rect || newNodes.length === 0) return
    const box = boundingBox(newNodes)
    setView((v) =>
      panIntoView(box, v, { width: rect.width, height: rect.height }),
    )
  }

  /** Applies an already-confirmed (or never-needed-confirming) in-app-clipboard paste. */
  function performPaste() {
    const { pastedNodes, boardNodes, offset } = pasteFromNodeClipboard(
      containerRects(),
    )
    if (pastedNodes.length > 0) addNodes(pastedNodes)
    const newBoardCards = duplicateBoardNodes(boardNodes, offset)
    const allNew = [...pastedNodes, ...newBoardCards]
    if (allNew.length === 0) return
    setSelection(allNew.map((node) => node.id))
    panNewNodesIntoView(allNew)
  }

  // CRAP scoring penalizes this handler for 0% coverage — component/
  // interaction tests aren't a required tier for v0 (spec §13); real
  // coverage comes from e2e (e2e/clipboard.spec.ts, e2e/multiboard.spec.ts),
  // which fallow's static analysis can't see.
  // fallow-ignore-next-line complexity
  function handlePaste(e: ClipboardEvent) {
    if (e.defaultPrevented) return // image/URL branches (useCardCreation.ts) already handled it
    if (isEditableTarget(e.target)) return // native textarea paste
    if (pendingConfirm) return // a blocking confirm modal is up (design doc §4)

    // The in-app clipboard's own populated state gates this, not the
    // *current* selection — copying, then deselecting before pasting (a
    // completely normal flow) must still paste what was copied, and for a
    // container (or anything else writing no text to the system clipboard)
    // the old `selection.size > 0` gate meant paste silently did nothing at
    // all once deselected.
    if (hasNodeClipboardContent) {
      e.preventDefault()
      const boardClipNodes = nodeClipboardContents.filter(isBoardCard)
      if (boardClipNodes.length > 0) {
        setPendingConfirm({
          ...boardConfirmCopy(
            'Paste',
            boardClipNodes.map((n) => n.boardRef),
            allNodes,
          ),
          confirmLabel: 'Paste',
          run: performPaste,
        })
        return
      }
      performPaste()
      return
    }

    // Plain OS-clipboard text as a new card, centered in the viewport,
    // stripped of any rich formatting (text/plain already is). Root only
    // ever creates board/container nodes (design doc §3) — never a text
    // card, so this is a no-op there.
    if (isRoot) return
    const text = e.clipboardData?.getData('text/plain')
    if (!text?.trim()) return
    e.preventDefault()
    const center = viewportCenter()
    const card = newTextCard(center.x, center.y, text)
    addNodes([card])
    setSelection([card.id])
  }

  function viewportCenter() {
    const rect = boardElRef.current?.getBoundingClientRect()
    return rect
      ? worldPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          rect,
          view,
        )
      : { x: 0, y: 0 }
  }

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  })

  function selectedNodesSnapshot(): Node[] {
    return [...selection]
      .map((id) => nodesById.get(id))
      .filter((node): node is Node => node !== undefined)
  }

  /** ⌘/Ctrl+Z / ⌘/Ctrl+Shift+Z / Ctrl+Y — not while typing in a caption (that's the browser's native text undo). */
  // CRAP scoring penalizes this handler's 0% coverage — component/
  // interaction tests aren't a required tier for v0 (spec §13); real
  // coverage comes from e2e (e2e/*.spec.ts), which fallow's static analysis
  // can't see. Same precedent as useBoardInteraction.ts (Stage 5).
  // fallow-ignore-next-line complexity
  function tryUndoRedo(e: KeyboardEvent, mod: boolean, key: string): boolean {
    if (!mod || (key !== 'z' && key !== 'y') || isEditableTarget(e.target)) {
      return false
    }
    e.preventDefault()
    if (key === 'y' || e.shiftKey) redo()
    else undo()
    return true
  }

  /** ⌘/Ctrl+N — a fresh empty text card, centered, immediately focused for editing. Root only ever creates board/container nodes (design doc §3), so this shortcut does nothing there. */
  // CRAP scoring penalizes this handler for 0% coverage — component/
  // interaction tests aren't a required tier for v0 (spec §13); real
  // coverage comes from e2e (e2e/clipboard.spec.ts, e2e/multiboard.spec.ts),
  // which fallow's static analysis can't see.
  // fallow-ignore-next-line complexity
  function tryNewCard(e: KeyboardEvent, mod: boolean, key: string): boolean {
    if (!mod || key !== 'n' || isEditableTarget(e.target) || isRoot) {
      return false
    }
    e.preventDefault()
    const center = viewportCenter()
    const card = newTextCard(center.x, center.y)
    addNodes([card])
    setSelection([card.id])
    setFocusNodeId(card.id)
    return true
  }

  /** ⌘/Ctrl+C — in-app node clipboard + (if any caption text) the OS clipboard. */
  // fallow-ignore-next-line complexity
  function tryCopy(e: KeyboardEvent, mod: boolean, key: string): boolean {
    if (!mod || key !== 'c' || isEditableTarget(e.target)) return false
    e.preventDefault()
    const selectedNodes = selectedNodesSnapshot()
    if (!copyToNodeClipboard(selectedNodes)) return true
    const text = selectionTextForSystemClipboard(selectedNodes)
    if (text) writeTextToSystemClipboard(text)
    return true
  }

  /** Applies an already-confirmed (or never-needed-confirming) ⌘/Ctrl+D duplicate. */
  // CRAP scoring penalizes this handler for 0% coverage — component/
  // interaction tests aren't a required tier for v0 (spec §13); real
  // coverage comes from e2e (e2e/clipboard.spec.ts, e2e/multiboard.spec.ts),
  // which fallow's static analysis can't see.
  // fallow-ignore-next-line complexity
  function performDuplicate(
    boardNodes: readonly BoardCard[],
    restNodes: readonly Node[],
    offset: number,
  ) {
    const restDuplicates = duplicateNodes(restNodes, containerRects(), offset)
    if (restDuplicates.length > 0) addNodes(restDuplicates)
    const newBoardCards = duplicateBoardNodes(boardNodes, offset)
    const allNew = [...restDuplicates, ...newBoardCards]
    if (allNew.length === 0) return
    setSelection(allNew.map((node) => node.id))
    panNewNodesIntoView(allNew)
    // "immediately focused for editing (single-card case)" — spec §4.2. A
    // board card has no caption field to focus (its title field lives
    // outside `contentRef`, multiboard support design doc §3), so this is
    // scoped to every *other* card kind, same as before that kind existed.
    const only = allNew.length === 1 ? allNew[0] : undefined
    if (only?.type === 'card' && only.kind !== 'board') {
      setFocusNodeId(only.id)
    }
  }

  /** ⌘/Ctrl+D — duplicate selection, focusing the duplicate in the single-card case. */
  // fallow-ignore-next-line complexity
  function tryDuplicate(e: KeyboardEvent, mod: boolean, key: string): boolean {
    if (!mod || key !== 'd') return false
    e.preventDefault()
    const selected = selectedNodesSnapshot()
    if (selected.length === 0) return true
    const boardNodes = selected.filter(isBoardCard)
    const restNodes = selected.filter((n) => !isBoardCard(n))
    const offset = computePasteOffset(
      1,
      boundingBox(selected),
      containerRects(),
    )

    if (boardNodes.length > 0) {
      setPendingConfirm({
        ...boardConfirmCopy(
          'Duplicate',
          boardNodes.map((n) => n.boardRef),
          allNodes,
        ),
        confirmLabel: 'Duplicate',
        run: () => performDuplicate(boardNodes, restNodes, offset),
      })
      return true
    }
    performDuplicate(boardNodes, restNodes, offset)
    return true
  }

  /** Backspace/Delete — not while actively editing a caption. */
  // fallow-ignore-next-line complexity
  function tryDelete(e: KeyboardEvent, mod: boolean): boolean {
    if (
      mod ||
      (e.key !== 'Backspace' && e.key !== 'Delete') ||
      isEditableTarget(e.target)
    ) {
      return false
    }
    e.preventDefault()
    const ids = [...selection]
    function performDelete() {
      removeEntities(ids)
      setSelection([])
    }
    const boardRefs = selectedNodesSnapshot()
      .filter(isBoardCard)
      .map((n) => n.boardRef)
    if (boardRefs.length > 0) {
      setPendingConfirm({
        ...boardConfirmCopy('Delete', boardRefs, allNodes),
        confirmLabel: 'Delete',
        run: performDelete,
      })
      return true
    }
    performDelete()
    return true
  }

  useEffect(() => {
    // Shortcuts requiring a non-empty selection (copy/duplicate/delete) come
    // after the two that don't (undo/redo, new card) — `.some()` stops at
    // the first handler that reports it acted, same short-circuiting as the
    // if-chain this replaces, just below Biome's cognitive-complexity cap.
    const handlers: ((
      e: KeyboardEvent,
      mod: boolean,
      key: string,
    ) => boolean)[] = [
      tryUndoRedo,
      tryNewCard,
      (e, mod, key) => selection.size > 0 && tryCopy(e, mod, key),
      (e, mod, key) => selection.size > 0 && tryDuplicate(e, mod, key),
      (e, mod) => selection.size > 0 && tryDelete(e, mod),
    ]

    function onKeyDown(e: KeyboardEvent) {
      // A pending confirm modal is a hard, blocking gate (design doc
      // §4) — no other shortcut should sneak past it while it's open.
      if (pendingConfirm) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      handlers.some((handler) => handler(e, mod, key))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return { pendingConfirm, confirmPending, cancelPending }
}
