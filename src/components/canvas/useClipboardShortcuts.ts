// The rest of spec §7's paste priority order (in-app node clipboard, plain
// OS-clipboard text as a new card) plus spec §4.2's remaining keyboard
// shortcuts not already owned by another hook: undo/redo, ⌘/Ctrl+N (new
// card), ⌘/Ctrl+D (duplicate), ⌘/Ctrl+C (copy — in-app + system-clipboard
// text), Backspace/Delete. Image/URL-on-clipboard paste (the two highest-
// priority branches) already live in useCardCreation.ts (Stage 6) — this
// hook's `paste` listener only runs its own branches when that one left
// the event unhandled (`e.defaultPrevented` stays false).

import { useAtomValue, useSetAtom } from 'jotai'
import type { RefObject } from 'react'
import { useEffect } from 'react'
import { newTextCard } from '../../cards/newCard'
import { isEditableTarget } from '../../clipboard/dom'
import { duplicateNodes } from '../../clipboard/duplicateNodes'
import {
  copyToNodeClipboardAtom,
  pasteFromNodeClipboardAtom,
} from '../../clipboard/nodeClipboard'
import { panIntoView } from '../../clipboard/panIntoView'
import {
  selectionTextForSystemClipboard,
  writeTextToSystemClipboard,
} from '../../clipboard/systemClipboard'
import { boundingBox } from '../../geometry/containment'
import type { Rect } from '../../geometry/snap'
import type { Node, NodeId } from '../../schema/node'
import { focusNodeIdAtom } from '../../state/atoms/focus'
import { addNodesAtom, removeEntitiesAtom } from '../../state/atoms/nodes'
import { selectionAtom, setSelectionAtom } from '../../state/atoms/selection'
import {
  redoBoardAtom,
  undoBoardAtom,
} from '../../state/history/boardHistoryAtom'
import type { View } from './viewportCoords'
import { worldPoint } from './viewportCoords'

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
  const addNodes = useSetAtom(addNodesAtom)
  const removeEntities = useSetAtom(removeEntitiesAtom)
  const copyToNodeClipboard = useSetAtom(copyToNodeClipboardAtom)
  const pasteFromNodeClipboard = useSetAtom(pasteFromNodeClipboardAtom)
  const setSelection = useSetAtom(setSelectionAtom)
  const setFocusNodeId = useSetAtom(focusNodeIdAtom)
  const undo = useSetAtom(undoBoardAtom)
  const redo = useSetAtom(redoBoardAtom)

  function containerRects(): Rect[] {
    return nodes
      .filter((node) => node.type === 'container')
      .map((node) => ({ x: node.x, y: node.y, w: node.w, h: node.h }))
  }

  function panPastedIntoView(pasted: readonly Node[]) {
    const rect = boardElRef.current?.getBoundingClientRect()
    if (!rect || pasted.length === 0) return
    const box = boundingBox(pasted)
    setView((v) =>
      panIntoView(box, v, { width: rect.width, height: rect.height }),
    )
  }

  // fallow-ignore-next-line complexity
  function handlePaste(e: ClipboardEvent) {
    if (e.defaultPrevented) return // image/URL branches (useCardCreation.ts) already handled it
    if (isEditableTarget(e.target)) return // native textarea paste

    if (selection.size > 0) {
      e.preventDefault()
      const pasted = pasteFromNodeClipboard(containerRects())
      if (pasted.length === 0) return
      addNodes(pasted)
      setSelection(pasted.map((node) => node.id))
      panPastedIntoView(pasted)
      return
    }

    // Plain OS-clipboard text as a new card, centered in the viewport,
    // stripped of any rich formatting (text/plain already is).
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

  /** ⌘/Ctrl+N — a fresh empty text card, centered, immediately focused for editing. */
  function tryNewCard(e: KeyboardEvent, mod: boolean, key: string): boolean {
    if (!mod || key !== 'n' || isEditableTarget(e.target)) return false
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

  /** ⌘/Ctrl+D — duplicate selection, focusing the duplicate in the single-card case. */
  // fallow-ignore-next-line complexity
  function tryDuplicate(e: KeyboardEvent, mod: boolean, key: string): boolean {
    if (!mod || key !== 'd') return false
    e.preventDefault()
    const duplicates = duplicateNodes(selectedNodesSnapshot())
    if (duplicates.length === 0) return true
    addNodes(duplicates)
    setSelection(duplicates.map((node) => node.id))
    // "immediately focused for editing (single-card case)" — spec §4.2.
    if (duplicates.length === 1 && duplicates[0]?.type === 'card') {
      setFocusNodeId(duplicates[0].id)
    }
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
    removeEntities([...selection])
    setSelection([])
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
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      handlers.some((handler) => handler(e, mod, key))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
}
