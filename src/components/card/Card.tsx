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

function useAutoGrowHeight(
  contentRef: React.RefObject<HTMLTextAreaElement | null>,
  skip: boolean,
) {
  useLayoutEffect(() => {
    if (skip) return
    const el = contentRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [skip, contentRef])
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
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onConnectorPointerDown,
  onConnectorPointerMove,
  onConnectorPointerUp,
}: {
  node: CardNode
  imageSrc?: string
  theme: Theme
  viewMode: ViewMode
  selected?: boolean
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
  onResizePointerDown?: (
    id: string,
    dir: ResizeDir,
    kind: ResizeKind,
    e: React.PointerEvent,
  ) => void
  onResizePointerMove?: (e: React.PointerEvent) => void
  onResizePointerUp?: (e: React.PointerEvent) => void
  onConnectorPointerDown?: (
    id: string,
    side: Side,
    e: React.PointerEvent,
  ) => void
  onConnectorPointerMove?: (e: React.PointerEvent) => void
  onConnectorPointerUp?: (e: React.PointerEvent) => void
}) {
  const isBig = node.kind === 'text' && node.size === 'big'
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

  // Regular notes grow to fit their content; big text has an explicit,
  // user-resized height instead (a later stage's resize handles), so it
  // never participates in this.
  useAutoGrowHeight(contentRef, isBig)

  // Stored height is the source of truth once measured (spec §2.4) — a
  // regular card's total rendered height (bar + content) only lives in the
  // DOM moment-to-moment, so this flows it one-way into the node.
  useMeasuredHeight(cardElRef, isBig, onHeightChange)

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
        isBig,
        isDone,
        isDimmed: isDimmedByViewMode,
        selected,
      })}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: isBig ? node.h : undefined,
        borderColor,
      }}
      onPointerDown={onPointerDown && ((e) => onPointerDown(node.id, e))}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <CardBody
        node={node}
        imageSrc={imageSrc}
        theme={theme}
        showCaption={showCaption}
        tinted={isDone || isDimmedByViewMode}
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
      {isBig &&
        onResizePointerDown &&
        onResizePointerMove &&
        onResizePointerUp && (
          <ResizeHandles
            id={node.id}
            kind="bigText"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
          />
        )}
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
