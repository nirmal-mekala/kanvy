// Per-board page: syncs `currentBoardIdAtom` from the active route's board
// id and clears selection/focus on every board-route change. `boardId` is
// passed in as a prop rather than read via route params here, since this
// component is shared by both the home route (`/`, fixed at
// `ROOT_BOARD_ID`) and the `/$boardId` route (router.tsx) — reading params
// directly would only work for the latter.
//
// Neither the multiboard design doc nor the implementation plan's Q1/Q2
// resolve the selection/focus question definitively — clearing on
// navigation is the obviously-correct default (ctx/notes/260917-
// multiboard-implementation-plan.md §1's Q2): a stale selection from
// another board is functionally inert once filtered by `boardId` (ids are
// globally unique), but a phantom selection reappearing on navigating back
// to that board is still worth avoiding.

import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { currentBoardIdAtom } from '../../state/atoms/currentBoard'
import { focusNodeIdAtom } from '../../state/atoms/focus'
import { clearSelectionAtom } from '../../state/atoms/selection'
import { Breadcrumb } from '../breadcrumb/Breadcrumb'
import { Canvas } from './Canvas'

export function BoardPage({ boardId }: { boardId: string }) {
  const setCurrentBoardId = useSetAtom(currentBoardIdAtom)
  const clearSelection = useSetAtom(clearSelectionAtom)
  const setFocusNodeId = useSetAtom(focusNodeIdAtom)

  useEffect(() => {
    setCurrentBoardId(boardId)
    clearSelection()
    setFocusNodeId(null)
  }, [boardId, setCurrentBoardId, clearSelection, setFocusNodeId])

  return (
    <>
      <Breadcrumb boardId={boardId} />
      <Canvas />
    </>
  )
}
