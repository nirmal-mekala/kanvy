// Shared hover-to-edit board-name control (developer follow-up, 260918 —
// see ctx/notes/260918-board-node-redesign.md): both the board card's
// on-canvas name (CardBody.tsx) and the breadcrumb's current-board title
// (Breadcrumb.tsx) use this, so the two look and behave identically
// rather than each hand-rolling their own edit affordance.
//
// Interaction model (explicit commit, not blur-to-save): the name is
// read-only text/a nav button by default. Hovering (or focusing, for
// keyboard users) reveals a pencil button; clicking it enters edit mode,
// swapping the pencil for a checkmark in the same slot — an explicit
// "you are now editing / here's how you leave" pair, rather than a mode
// change with no visible affordance. Only Enter or clicking the checkmark
// commits; blurring the field (clicking away, navigating, tabbing off) or
// Escape both discard the draft — the checkmark would be pointless as a
// "confirm" affordance if blur saved anyway. The checkmark's
// `onMouseDown` preventDefault keeps focus in the input through the click
// so the click handler actually fires (a plain click would otherwise
// blur-and-discard first, then miss the now-different element under the
// cursor).

import { Check, Pencil } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

export function BoardNameEditor({
  title,
  onRename,
  onActivate,
  ariaLabel = 'Board title',
  className,
}: {
  title: string
  onRename: (value: string) => void
  /** When present, the text becomes a button that activates (navigates) on click — the board card's case. Omitted for the breadcrumb, which has no "activate" concept for its own current board. */
  onActivate?: () => void
  ariaLabel?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const editing = draft !== null

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function commit() {
    const trimmed = draft?.trim()
    setDraft(null)
    if (trimmed && trimmed !== title) onRename(trimmed)
  }

  function discard() {
    setDraft(null)
  }

  function startEdit(e: MouseEvent) {
    e.stopPropagation()
    setDraft(title)
  }

  const classes = ['board-name', editing && 'board-name--editing', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {editing ? (
        <>
          <input
            ref={inputRef}
            className="board-name__input"
            aria-label={ariaLabel}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={discard}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') discard()
            }}
          />
          <button
            type="button"
            className="board-name__edit-btn board-name__edit-btn--confirm"
            aria-label="Save board name"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
          >
            <Check size={14} strokeWidth={2} />
          </button>
        </>
      ) : onActivate ? (
        <>
          <button
            type="button"
            className="board-name__activate"
            onClick={onActivate}
          >
            <span className="board-name__text">{title}</span>
          </button>
          <button
            type="button"
            className="board-name__edit-btn"
            aria-label="Edit board name"
            onClick={startEdit}
          >
            <Pencil size={14} />
          </button>
        </>
      ) : (
        <>
          <span className="board-name__text">{title}</span>
          <button
            type="button"
            className="board-name__edit-btn"
            aria-label="Edit board name"
            onClick={startEdit}
          >
            <Pencil size={14} />
          </button>
        </>
      )}
    </div>
  )
}
