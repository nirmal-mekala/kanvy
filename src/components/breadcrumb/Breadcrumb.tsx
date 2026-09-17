// Header-bar breadcrumb (multiboard support design doc §6): home icon (→
// /board/root) + chevron + the current board's title, editable inline —
// the same `showCaption`-style visibility rule the on-canvas rename uses
// (content-or-selected) doesn't apply here (there's no "selected" concept
// for a breadcrumb), so this just toggles a plain edit-on-click state
// instead. Both this and the on-canvas rename (Sub-phase 4) write to the
// same `boards[boardId].title` via `renameBoardAtom` — the single source
// of truth (design doc §2). Disabled entirely on the root board, whose
// title is fixed (design doc §2/§7) — nesting never exceeds one level
// (board-in-board is out of scope, design doc §1), so this never needs to
// render more than a home icon plus one segment.

import { Link } from '@tanstack/react-router'
import { useAtomValue, useSetAtom } from 'jotai'
import { Home } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import { boardFamily, renameBoardAtom } from '../../state/atoms/boards'

// CRAP scoring penalizes this component's 0% (component-test) coverage —
// component tests aren't a required tier for v0 (spec §13); real coverage
// comes from e2e (e2e/multiboard.spec.ts), which fallow's static analysis
// can't see. Same precedent as Card.tsx/Canvas.tsx/CardBody.tsx.
// fallow-ignore-next-line complexity
export function Breadcrumb({ boardId }: { boardId: string }) {
  const board = useAtomValue(boardFamily(boardId))
  const renameBoard = useSetAtom(renameBoardAtom)
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Same pattern as Card.tsx's caption autoFocus — a manual imperative
  // focus rather than the JSX `autoFocus` attribute, which Biome's a11y
  // rule flags regardless of whether it's user-triggered.
  useEffect(() => {
    if (draft !== null) inputRef.current?.focus()
  }, [draft])

  function commit() {
    const trimmed = draft?.trim()
    setDraft(null)
    if (trimmed && trimmed !== board?.title) renameBoard(boardId, trimmed)
  }

  return (
    <div className="breadcrumb">
      <Link
        to="/board/$boardId"
        params={{ boardId: ROOT_BOARD_ID }}
        className="breadcrumb__home"
        aria-label="Home"
      >
        <Home size={16} strokeWidth={2} />
      </Link>
      {boardId !== ROOT_BOARD_ID && (
        <>
          <span className="breadcrumb__chevron" aria-hidden="true">
            /
          </span>
          {draft === null ? (
            <button
              type="button"
              className="breadcrumb__title"
              onClick={() => setDraft(board?.title ?? '')}
            >
              {board?.title ?? ''}
            </button>
          ) : (
            <input
              ref={inputRef}
              className="breadcrumb__title-input"
              aria-label="Board title"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') setDraft(null)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
