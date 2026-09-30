// The `:query` dropdown rendered by any field wired to
// src/emoji/useEmojiTrigger.ts. `position:fixed` at viewport coordinates
// from getCaretCoordinates, which (via getBoundingClientRect) already
// accounts for canvas pan/zoom when computing *where* to place the menu —
// but a `position: fixed` element only resolves those coordinates against
// the real viewport when none of its own DOM ancestors has a `transform`
// (or `filter`/`perspective`) set; otherwise it's fixed relative to that
// ancestor instead (CSS spec: such a property creates a new containing
// block for fixed-position descendants). The canvas's pan/zoom is exactly
// such a transform (`.board__layer` in Canvas.tsx), and a card's content
// field lives inside it — so this portals into `document.body`, clear of
// that ancestor, rather than rendering inline where the field is (as
// BoardNameEditor's caller does for the rest of its UI). The breadcrumb's
// board-name field sits outside the canvas entirely, so it was never
// affected, which is why this bug only showed up for on-canvas fields.
//
// Each item's `onMouseDown` preventDefault mirrors BoardNameEditor's
// confirm-button trick: without it, the button would steal focus before
// its `onClick` fires, which for a commit-on-blur field (BoardNameEditor)
// would close the editor out from under the click.
//
// The variant sub-menu lays its grid out with skin tones across (columns,
// `grid.tones`) and genders down (rows, `grid.genders`) — a gender axis is
// only present at all for the ~50 emoji families that have one.
//
// `position` (from getCaretCoordinates) is only ever the *natural* anchor
// — directly under the caret — with no idea how wide/tall this menu will
// actually render (that depends on its content: a long emoji name, a
// heading-sized field's large fontSize, how many results there are). A
// field near the right or bottom edge of the screen (a wide h1 field, a
// card near the window edge) can put that natural anchor off-screen
// entirely. So this renders once at the natural position, measures its
// own rendered box, and — only if it would overflow — nudges left back
// on-screen or flips above the caret instead of below it.

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EmojiEntry } from '../../emoji/emojiTypes'
import type { VariantGrid, VariantOption } from '../../emoji/variantList'

const TONE_LABELS: Record<number, string> = {
  0: 'default',
  1: 'light',
  2: 'medium-light',
  3: 'medium',
  4: 'medium-dark',
  5: 'dark',
}

const GENDER_LABELS: Record<string, string> = {
  neutral: 'neutral',
  man: 'man',
  woman: 'woman',
}

const VIEWPORT_MARGIN = 8

/** Nudges `{ top, left }` back within the viewport (minus a small margin), flipping above the caret instead of clamping the bottom when there's room to. `anchorTop` is the caret's own top (not `natural.top`, which already includes the caret's height) — flipping measures from there so the menu's bottom edge lands right at the caret's top edge. */
function clampToViewport(
  natural: { top: number; left: number },
  anchorTop: number,
  menuSize: { width: number; height: number },
): { top: number; left: number } {
  const maxLeft = window.innerWidth - menuSize.width - VIEWPORT_MARGIN
  const left = Math.min(natural.left, Math.max(VIEWPORT_MARGIN, maxLeft))

  const overflowsBottom =
    natural.top + menuSize.height > window.innerHeight - VIEWPORT_MARGIN
  const flippedTop = anchorTop - menuSize.height
  const top =
    overflowsBottom && flippedTop >= VIEWPORT_MARGIN
      ? flippedTop
      : Math.min(
          natural.top,
          Math.max(
            VIEWPORT_MARGIN,
            window.innerHeight - menuSize.height - VIEWPORT_MARGIN,
          ),
        )

  return { top, left }
}

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from e2e
// (e2e/*.spec.ts), which fallow's static analysis can't see. Same
// precedent as SelectionMenu.tsx/CardBody.tsx/Card.tsx.
// fallow-ignore-next-line complexity
function VariantCell({
  cell,
  active,
  itemRef,
  onSelect,
}: {
  cell: VariantOption | null
  active: boolean
  itemRef?: (el: HTMLButtonElement | null) => void
  onSelect: () => void
}) {
  const title = cell
    ? `${GENDER_LABELS[cell.gender] ?? cell.gender}, ${TONE_LABELS[cell.tone] ?? ''}`.trim()
    : undefined
  return (
    <button
      ref={itemRef}
      type="button"
      disabled={!cell}
      className={`emoji-menu__variant${active ? ' emoji-menu__variant--active' : ''}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      {cell?.char ?? ''}
    </button>
  )
}

export function EmojiSuggestionMenu({
  mode,
  results,
  activeIndex,
  grid,
  row,
  col,
  position,
  fontSize,
  onSelectResult,
  onSelectVariant,
}: {
  mode: 'list' | 'variants'
  results: readonly EmojiEntry[]
  activeIndex: number
  grid: VariantGrid | null
  row: number
  col: number
  position: { top: number; left: number; height: number }
  fontSize: string
  onSelectResult: (index: number) => void
  onSelectVariant: (row: number, col: number) => void
}) {
  // Keeps the keyboard-highlighted item in view within `.emoji-menu`'s
  // scrollable list (emoji-menu.css: `max-height: 220px; overflow-y: auto;`) —
  // otherwise arrow-key navigation past the initially visible rows moves
  // `activeIndex` with nothing on screen to show for it.
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: none of these are read in the body, but the effect must re-run whenever the highlighted item changes — activeItemRef.current is reassigned during render (whichever button is currently active), so mode/activeIndex/row/col are what actually changed, not anything referenced here.
  useLayoutEffect(() => {
    activeItemRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [mode, activeIndex, row, col])

  const natural = { top: position.top + position.height, left: position.left }
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = useState(natural)

  // Resets to the natural (under-the-caret) position whenever the caret
  // itself moves, then the effect below measures the actual rendered menu
  // and nudges it back on-screen if needed. Two effects (rather than
  // computing this inline) because the clamp needs the menu's real
  // rendered size, which isn't known until after it's painted once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: natural is a fresh object every render; the primitives it's built from are the real, narrower dependency.
  useLayoutEffect(() => {
    setPlacement(natural)
  }, [position.top, position.left, position.height])

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const clamped = clampToViewport(placement, position.top, {
      width: rect.width,
      height: rect.height,
    })
    if (clamped.top !== placement.top || clamped.left !== placement.left) {
      setPlacement(clamped)
    }
  })

  return createPortal(
    <div
      ref={menuRef}
      className="emoji-menu"
      style={{
        top: placement.top,
        left: placement.left,
        fontSize,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {mode === 'list' ? (
        <ul className="emoji-menu__list">
          {results.map((entry, i) => {
            const isActive = i === activeIndex
            return (
              <li key={entry.id}>
                <button
                  ref={isActive ? activeItemRef : undefined}
                  type="button"
                  className={`emoji-menu__item${isActive ? ' emoji-menu__item--active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelectResult(i)}
                >
                  <span className="emoji-menu__glyph">{entry.char}</span>
                  <span className="emoji-menu__name">{entry.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        grid && (
          <div
            className="emoji-menu__variants"
            style={{
              gridTemplateColumns: `repeat(${grid.tones.length}, auto)`,
            }}
          >
            {grid.cells.map((cells, r) =>
              cells.map((cell, c) => {
                const isActive = r === row && c === col
                return (
                  <VariantCell
                    key={`${grid.genders[r]}:${grid.tones[c]}`}
                    cell={cell}
                    active={isActive}
                    onSelect={() => onSelectVariant(r, c)}
                    {...(isActive
                      ? {
                          itemRef: (el: HTMLButtonElement | null) => {
                            activeItemRef.current = el
                          },
                        }
                      : {})}
                  />
                )
              }),
            )}
          </div>
        )
      )}
    </div>,
    document.body,
  )
}
