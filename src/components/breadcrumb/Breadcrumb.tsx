// Header-bar breadcrumb (multiboard support design doc §6): home icon (→
// /) + chevron + the current board's title. The title uses the shared
// `BoardNameEditor` (../board) — hover-to-reveal pencil, click to edit,
// checkmark/blur/Enter to commit, Escape to cancel — the same control the
// on-canvas board-node rename uses (revised 260918, see ctx/notes/260918-
// board-node-redesign.md), so the two look and behave identically. Both
// write to the same `boards[boardId].title` via `renameBoardAtom` — the
// single source of truth (design doc §2). Disabled entirely on the root
// board, whose title is fixed (design doc §2/§7) — nesting never exceeds
// one level (board-in-board is out of scope, design doc §1), so this
// never needs to render more than a home icon plus one segment.

import { Link } from '@tanstack/react-router'
import { useAtomValue, useSetAtom } from 'jotai'
import { Home } from 'lucide-react'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import { boardFamily, renameBoardAtom } from '../../state/atoms/boards'
import { BoardNameEditor } from '../board/BoardNameEditor'

export function Breadcrumb({ boardId }: { boardId: string }) {
  const board = useAtomValue(boardFamily(boardId))
  const renameBoard = useSetAtom(renameBoardAtom)

  return (
    <div className="breadcrumb">
      <Link to="/" className="breadcrumb__home" aria-label="Home">
        <Home size={16} strokeWidth={2} />
      </Link>
      {boardId !== ROOT_BOARD_ID && (
        <>
          <span className="breadcrumb__chevron" aria-hidden="true">
            /
          </span>
          <BoardNameEditor
            title={board?.title ?? ''}
            onRename={(value) => renameBoard(boardId, value)}
            className="breadcrumb__title"
          />
        </>
      )}
    </div>
  )
}
