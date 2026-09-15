// The 4 connector-affordance dots rendered on a card/container's sides on
// hover (spec §4.6) — dragging from one starts a connection; see
// useConnectionInteraction.ts for the pointer-event handling itself.

import type { Side } from '../../geometry/anchor'

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

export function NodeConnectors({
  nodeId,
  activeSide,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  nodeId: string
  activeSide: Side | null
  onPointerDown: (nodeId: string, side: Side, e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}) {
  return (
    <>
      {SIDES.map((side) => (
        <div
          key={side}
          className={`node-connector node-connector--${side}${
            activeSide === side ? ' node-connector--active' : ''
          }`}
          data-node-id={nodeId}
          data-side={side}
          onPointerDown={(e) => onPointerDown(nodeId, side, e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ))}
    </>
  )
}
