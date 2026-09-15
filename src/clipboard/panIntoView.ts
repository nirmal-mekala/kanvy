// Pans the viewport (without changing zoom) so `box` (world-space) is
// fully visible, centering on it — a no-op if it's already fully visible
// (spec §7: "if the paste lands outside the current viewport, the view
// pans... to bring it fully into view"). Ported from the prototype's
// `panIntoView` (ctx/support/260915-prototype-source/src/components/Board.jsx).

import type { View } from '../components/canvas/viewportCoords'
import type { Rect } from '../geometry/snap'

export function panIntoView(
  box: Rect,
  view: View,
  viewportSize: { width: number; height: number },
): View {
  const screenLeft = box.x * view.zoom + view.x
  const screenTop = box.y * view.zoom + view.y
  const screenRight = (box.x + box.w) * view.zoom + view.x
  const screenBottom = (box.y + box.h) * view.zoom + view.y
  const fullyVisible =
    screenLeft >= 0 &&
    screenTop >= 0 &&
    screenRight <= viewportSize.width &&
    screenBottom <= viewportSize.height
  if (fullyVisible) return view

  const worldCenterX = box.x + box.w / 2
  const worldCenterY = box.y + box.h / 2
  const anchorX = viewportSize.width / 2
  const anchorY = viewportSize.height / 2
  return {
    ...view,
    x: anchorX - worldCenterX * view.zoom,
    y: anchorY - worldCenterY * view.zoom,
  }
}
