// 8-way resize handles (spec §4.4) — shared between a container (always
// resizable), a big-text card (resizable only in that size variant), and a
// board card (east/west only — see `BOARD_MIN_W`'s comment).

import type { ResizeDir, ResizeKind } from './useBoardInteraction'

const ALL_HANDLES: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

export function ResizeHandles({
  id,
  kind,
  dirs = ALL_HANDLES,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  id: string
  kind: ResizeKind
  /** Restricts which of the 8 handles render — defaults to all of them. */
  dirs?: ResizeDir[]
  onPointerDown: (
    id: string,
    dir: ResizeDir,
    kind: ResizeKind,
    e: React.PointerEvent,
  ) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerCancel?: (e: React.PointerEvent) => void
}) {
  return (
    <>
      {dirs.map((dir) => (
        <div
          key={dir}
          className={`resize-handle resize-handle--${dir}`}
          onPointerDown={(e) => onPointerDown(id, dir, kind, e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
      ))}
    </>
  )
}
