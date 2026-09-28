// Shared hover-to-edit board-name control (developer follow-up, 260918 —
// see ctx/notes/260918-board-node-redesign.md): both the board card's
// on-canvas name (CardBody.tsx) and the breadcrumb's current-board title
// (Breadcrumb.tsx) use this, so the two look and behave identically
// rather than each hand-rolling their own edit affordance.
//
// Interaction model (commit-on-blur): the name is read-only text/a nav
// button by default. Hovering (or focusing, for keyboard users) reveals a
// pencil button; clicking it enters edit mode, swapping the pencil for a
// checkmark in the same slot. Enter, clicking the checkmark, or blurring
// the field (clicking away, navigating, tabbing off) all commit the
// draft; Escape discards it instead. The checkmark's `onMouseDown`
// preventDefault keeps focus in the input through the click so the click
// handler actually fires (a plain click would otherwise blur-and-commit
// first, then miss the now-different element under the cursor).

import { Check, Pencil } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useEmojiTrigger } from '../../emoji/useEmojiTrigger'
import { EmojiSuggestionMenu } from '../emoji/EmojiSuggestionMenu'

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from e2e
// (e2e/*.spec.ts), which fallow's static analysis can't see. Same
// precedent as SelectionMenu.tsx/CardBody.tsx/Card.tsx.
// fallow-ignore-next-line complexity
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

  const [emojiView, emojiHandlers] = useEmojiTrigger(inputRef, (newValue) =>
    setDraft(newValue),
  )

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
            onChange={(e) => {
              setDraft(e.target.value)
              emojiHandlers.handleChange()
            }}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              emojiHandlers.handleBlur()
              commit()
            }}
            onKeyDown={(e) => {
              if (emojiHandlers.handleKeyDown(e)) {
                e.preventDefault()
                return
              }
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') discard()
            }}
          />
          {emojiView.isOpen && emojiView.position && (
            <EmojiSuggestionMenu
              mode={emojiView.mode}
              results={emojiView.results}
              activeIndex={emojiView.activeIndex}
              grid={emojiView.grid}
              row={emojiView.row}
              col={emojiView.col}
              position={emojiView.position}
              fontSize={
                inputRef.current
                  ? window.getComputedStyle(inputRef.current).fontSize
                  : '0.85rem'
              }
              onSelectResult={emojiHandlers.selectResult}
              onSelectVariant={emojiHandlers.selectVariant}
            />
          )}
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
