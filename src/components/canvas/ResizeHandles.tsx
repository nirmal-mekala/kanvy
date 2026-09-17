// 8-way resize handles (spec §4.4) — shared between a container (always
// resizable) and a big-text card (resizable only in that size variant).

import type { ResizeDir, ResizeKind } from './useBoardInteraction'

const HANDLES: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

export function ResizeHandles({
  id,
  kind,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  id: string
  kind: ResizeKind
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
      {HANDLES.map((dir) => (
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
