// Per-board page: syncs `currentBoardIdAtom` from the `/board/$boardId`
// route param and clears selection/focus on every board-route change.
// Neither the multiboard design doc nor the implementation plan's Q1/Q2
// resolve the selection/focus question definitively — clearing on
// navigation is the obviously-correct default (ctx/notes/260917-
// multiboard-implementation-plan.md §1's Q2): a stale selection from
// another board is functionally inert once filtered by `boardId` (ids are
// globally unique), but a phantom selection reappearing on navigating back
// to that board is still worth avoiding.
//
// `getRouteApi` (rather than importing `boardRoute` from ../../router
// directly) avoids a circular import between this module and router.tsx,
// which references this component as `boardRoute`'s own `component`.

import { getRouteApi } from '@tanstack/react-router'
import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { currentBoardIdAtom } from '../../state/atoms/currentBoard'
import { focusNodeIdAtom } from '../../state/atoms/focus'
import { clearSelectionAtom } from '../../state/atoms/selection'
import { Breadcrumb } from '../breadcrumb/Breadcrumb'
import { Canvas } from './Canvas'

const routeApi = getRouteApi('/board/$boardId')

export function BoardPage() {
  const { boardId } = routeApi.useParams()
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
