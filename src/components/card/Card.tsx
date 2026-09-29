// Static card rendering (spec §5) — visual parity with the prototype's
// Card.jsx, minus the interactivity later stages own: drag/resize (Stage
// 5), caption editing/URL-slurp (Stage 6), connector affordances (Stage
// 6), selection-menu-driven task/color/pattern changes (Stage 8). This
// stage only needs correct static rendering plus the one piece of live
// data flow spec §2.4 requires regardless of interactivity: a regular
// card's rendered height flowing into the persisted `h` field.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { resolveNodeBorderColor, type ViewMode } from '../../colors/borderColor'
import type { Theme } from '../../colors/colorKey'
import type { Side } from '../../geometry/anchor'
import type { CardNode } from '../../schema/node'
import { NodeConnectors } from '../canvas/NodeConnectors'
import { ResizeHandles } from '../canvas/ResizeHandles'
import type { ResizeDir, ResizeKind } from '../canvas/useBoardInteraction'
import { CardBody } from './CardBody'
import { cardClassNames } from './cardClassNames'

// Named once and reused by both `CardResizeHandles` and `Card` below —
// two structurally-identical-but-separately-written inline function types
// here trip a TS union-comparison limitation (TS2719, "two different
// types with this name exist") once `CardNode`'s member count grew with
// schema v4's `status`/`index` fields; a single named alias sidesteps it.
type ResizePointerDownHandler = (
  id: string,
  dir: ResizeDir,
  kind: ResizeKind,
  e: React.PointerEvent,
) => void

/** Builds `CardResizeHandles`' optional-handler props, omitting any that are `undefined` (exactOptionalPropertyTypes) — pulled out of `Card` itself to keep its own cognitive complexity down. */
// fallow-ignore-next-line complexity
function resizeHandlerProps(
  onResizePointerDown: ResizePointerDownHandler | undefined,
  onResizePointerMove: ((e: React.PointerEvent) => void) | undefined,
  onResizePointerUp: ((e: React.PointerEvent) => void) | undefined,
  onResizePointerCancel: ((e: React.PointerEvent) => void) | undefined,
) {
  return {
    ...(onResizePointerDown ? { onResizePointerDown } : {}),
    ...(onResizePointerMove ? { onResizePointerMove } : {}),
    ...(onResizePointerUp ? { onResizePointerUp } : {}),
    ...(onResizePointerCancel ? { onResizePointerCancel } : {}),
  }
}

function useAutoGrowHeight(
  contentRef: React.RefObject<HTMLTextAreaElement | null>,
  content: string,
  skip: boolean,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: content isn't read in the body, but the effect must re-run on every keystroke to remeasure scrollHeight against the textarea's new content.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (skip) {
      // A heading's fixed height comes from CSS (`height: calc(100% -
      // 17px)`, index.css), which an inline style always beats — so a
      // stale `el.style.height` left over from a *previous* render where
      // this same textarea was a regular (auto-growing) card must be
      // cleared, not just skipped, or the heading is stuck rendering at
      // whatever height auto-grow last set it to (found via a screen
      // recording: a card typed as regular text, then converted to a
      // heading via the selection menu, kept the small pre-conversion
      // height forever).
      el.style.height = ''
      return
    }
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [skip, contentRef, content])
}

// A 1px tolerance: `scrollHeight`/`clientHeight` are both rounded to
// whole pixels but from independently-rounded sub-pixel layout values, so
// content that just barely fits can still read `scrollHeight ===
// clientHeight + 1` purely from rounding.
const CLIP_TOLERANCE_PX = 1

/**
 * Tracks whether a heading card's fixed box is clipping its own text
 * (spec §5.2: truncates rather than scrolling) — drives the small
 * `.card__content-more` glyph in `CardBody` so a truncated heading has a
 * visual cue instead of silently cutting off mid-line. Only meaningful
 * for headings (`active`); a regular card's box always grows to fit its
 * content, so it never clips.
 */
function useOverflowClipped(
  contentRef: React.RefObject<HTMLTextAreaElement | null>,
  active: boolean,
  content: string,
  h: number,
  w: number,
  setClipped: (clipped: boolean) => void,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: content/h/w aren't read in the body, but the effect must re-run whenever any of them could change whether the box clips its content.
  useLayoutEffect(() => {
    // An empty textarea can never be "clipped" — there's no content to
    // truncate — but `scrollHeight` doesn't know that: Chromium measures
    // an empty `<textarea>`'s `scrollHeight` from its *placeholder*
    // text's wrapped height, not the (empty) value, so a heading showing
    // "Write something..." wrapped across several lines at a large font
    // size read as clipped despite having nothing in it. This is exactly
    // what made the glyph look "always present" on this feature's first
    // attempt (confirmed by an isolated repro: an empty `<textarea
    // placeholder="…">` reports a multi-line `scrollHeight` purely from
    // the placeholder, with no other CSS involved).
    if (!active || content === '') {
      setClipped(false)
      return
    }
    const el = contentRef.current
    if (!el) return
    setClipped(el.scrollHeight > el.clientHeight + CLIP_TOLERANCE_PX)
  }, [active, content, h, w, contentRef, setClipped])
}

function useMeasuredHeight(
  cardElRef: React.RefObject<HTMLDivElement | null>,
  skip: boolean,
  onHeightChange: ((height: number) => void) | undefined,
) {
  useLayoutEffect(() => {
    if (skip || !onHeightChange) return
    const el = cardElRef.current
    if (!el) return
    // CRAP scoring penalizes this callback's 0% coverage — component
    // tests aren't a required tier for v0 (spec §13); ResizeObserver
    // behavior isn't unit-testable without one (jsdom has no real layout
    // engine).
    // fallow-ignore-next-line complexity
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const measured = Math.round(
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
      )
      if (measured > 0) onHeightChange(measured)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [skip, onHeightChange, cardElRef])
}

// Which (if any) resize handles a card kind gets: a heading-sized text
// card resizes 8-way, a board card (to accommodate longer board names)
// east/west only.
// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage of this
// rendering logic comes from e2e specs, which fallow's static analysis
// can't see.
// fallow-ignore-next-line complexity
function CardResizeHandles({
  node,
  isHeading,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onResizePointerCancel,
}: {
  node: CardNode
  isHeading: boolean
  onResizePointerDown?: ResizePointerDownHandler
  onResizePointerMove?: (e: React.PointerEvent) => void
  onResizePointerUp?: (e: React.PointerEvent) => void
  onResizePointerCancel?: (e: React.PointerEvent) => void
}) {
  if (!onResizePointerDown || !onResizePointerMove || !onResizePointerUp) {
    return null
  }
  const kind: ResizeKind | null = isHeading
    ? 'heading'
    : node.kind === 'board'
      ? 'board'
      : null
  if (!kind) return null
  return (
    <ResizeHandles
      id={node.id}
      kind={kind}
      {...(kind === 'board' ? { dirs: ['e', 'w'] as ResizeDir[] } : {})}
      onPointerDown={onResizePointerDown}
      onPointerMove={onResizePointerMove}
      onPointerUp={onResizePointerUp}
      {...(onResizePointerCancel
        ? { onPointerCancel: onResizePointerCancel }
        : {})}
    />
  )
}

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage of this
// rendering logic comes from e2e/visual-regression specs (Stages 4-10),
// which fallow's static analysis can't see.
// fallow-ignore-next-line complexity
export function Card({
  node,
  imageSrc,
  theme,
  viewMode,
  selected = false,
  dragging = false,
  connectorsVisible = false,
  connectorActiveSide = null,
  autoFocus = false,
  onAutoFocusHandled,
  onHeightChange,
  onContentChange,
  onContentBlur,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onResizePointerCancel,
  onConnectorPointerDown,
  onConnectorPointerMove,
  onConnectorPointerUp,
}: {
  node: CardNode
  imageSrc?: string
  theme: Theme
  viewMode: ViewMode
  selected?: boolean
  /** A transient z-index bump for the whole gesture (spec §4.4/index.css's `.card--dragging`) — never a change to stored node order. */
  dragging?: boolean
  connectorsVisible?: boolean
  connectorActiveSide?: Side | null
  /** Grabs this card's caption focus once on mount/update (⌘/Ctrl+N, ⌘/Ctrl+D — spec §4.2). */
  autoFocus?: boolean
  onAutoFocusHandled?: () => void
  onHeightChange?: (height: number) => void
  onContentChange?: (id: string, content: string) => void
  onContentBlur?: (id: string) => void
  onPointerDown?: (id: string, e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  onPointerCancel?: (e: React.PointerEvent) => void
  onResizePointerDown?: ResizePointerDownHandler
  onResizePointerMove?: (e: React.PointerEvent) => void
  onResizePointerUp?: (e: React.PointerEvent) => void
  onResizePointerCancel?: (e: React.PointerEvent) => void
  onConnectorPointerDown?: (
    id: string,
    side: Side,
    e: React.PointerEvent,
  ) => void
  onConnectorPointerMove?: (e: React.PointerEvent) => void
  onConnectorPointerUp?: (e: React.PointerEvent) => void
}) {
  const isHeading = node.kind === 'text' && node.size !== 'regular'
  // A board card's title is handled entirely inside CardBody's
  // `kind === 'board'` branch (always visible, via `BoardNameEditor`, not
  // gated by this at all — see ctx/notes/260918-board-node-redesign.md).
  // This remains the content-or-selected visibility rule for link/image
  // captions only.
  const showCaption =
    (node.kind !== 'image' && node.kind !== 'link') ||
    node.content !== '' ||
    selected
  const isDone = node.task?.status === 'done'
  // Task mode dims everything that isn't a task, so tasks stand out.
  const isDimmedByViewMode = viewMode === 'task' && node.task === undefined
  const borderColor = resolveNodeBorderColor(node, theme, viewMode)

  const cardElRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLTextAreaElement | null>(null)
  const [hovered, setHovered] = useState(false)
  const [clipped, setClipped] = useState(false)

  // Regular notes grow to fit their content; a heading-sized card (h1/h2/
  // h3) has an explicit, user-resized height instead (a later stage's
  // resize handles), so it never participates in this.
  useAutoGrowHeight(contentRef, node.content, isHeading)

  // Stored height is the source of truth once measured (spec §2.4) — a
  // regular card's total rendered height (bar + content) only lives in the
  // DOM moment-to-moment, so this flows it one-way into the node.
  useMeasuredHeight(cardElRef, isHeading, onHeightChange)

  useOverflowClipped(
    contentRef,
    isHeading,
    node.content,
    node.h,
    node.w,
    setClipped,
  )

  useEffect(() => {
    if (!autoFocus) return
    contentRef.current?.focus()
    onAutoFocusHandled?.()
  }, [autoFocus, onAutoFocusHandled])

  return (
    <div
      ref={cardElRef}
      data-node-id={node.id}
      data-testid="card"
      className={cardClassNames(node, {
        headingSize: node.kind === 'text' ? node.size : null,
        isDone,
        isDimmed: isDimmedByViewMode,
        selected,
        dragging,
      })}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: isHeading ? node.h : undefined,
        borderColor,
      }}
      onPointerDown={onPointerDown && ((e) => onPointerDown(node.id, e))}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <CardBody
        node={node}
        imageSrc={imageSrc}
        theme={theme}
        viewMode={viewMode}
        showCaption={showCaption}
        tinted={isDone || isDimmedByViewMode}
        clipped={clipped}
        contentRef={contentRef}
        {...(onContentChange
          ? {
              onContentChange: (content: string) =>
                onContentChange(node.id, content),
            }
          : {})}
        {...(onContentBlur
          ? { onContentBlur: () => onContentBlur(node.id) }
          : {})}
      />
      <CardResizeHandles
        node={node}
        isHeading={isHeading}
        {...resizeHandlerProps(
          onResizePointerDown,
          onResizePointerMove,
          onResizePointerUp,
          onResizePointerCancel,
        )}
      />
      {(hovered || selected || connectorsVisible) &&
        onConnectorPointerDown &&
        onConnectorPointerMove &&
        onConnectorPointerUp && (
          <NodeConnectors
            nodeId={node.id}
            activeSide={connectorActiveSide}
            onPointerDown={onConnectorPointerDown}
            onPointerMove={onConnectorPointerMove}
            onPointerUp={onConnectorPointerUp}
          />
        )}
    </div>
  )
}
