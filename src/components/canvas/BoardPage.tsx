// Per-board page: clears selection/focus on every board-route change.
// `currentBoardIdAtom` itself is set in router.tsx's `beforeLoad`, not
// here — see that file's comment for why an effect-based sync (the
// previous approach) went stale across the home/board unmount boundary.
// `boardId` is passed in as a prop rather than read via route params
// here, since this component is shared by both the home route (`/`,
// the live document's `isRoot` board) and the `/$boardId` route (router.tsx) —
// reading params directly would only work for the latter.
//
// Neither the multiboard design doc nor the implementation plan's Q1/Q2
// resolve the selection/focus question definitively — clearing on
// navigation is the obviously-correct default (ctx/notes/260917-
// multiboard-implementation-plan.md §1's Q2): a stale selection from
// another board is functionally inert once filtered by `boardId` (ids are
// globally unique), but a phantom selection reappearing on navigating back
// to that board is still worth avoiding.

import { useSetAtom } from 'jotai'
import { useLayoutEffect } from 'react'
import { focusNodeIdAtom } from '../../state/atoms/focus'
import { clearSelectionAtom } from '../../state/atoms/selection'
import { Canvas } from './Canvas'

export function BoardPage({ boardId }: { boardId: string }) {
  const clearSelection = useSetAtom(clearSelectionAtom)
  const setFocusNodeId = useSetAtom(focusNodeIdAtom)

  // `boardId` isn't referenced in the body — it's a trigger, not a value,
  // so this re-runs once per board switch rather than only on mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useLayoutEffect(() => {
    clearSelection()
    setFocusNodeId(null)
  }, [boardId, clearSelection, setFocusNodeId])

  return <Canvas />
}
