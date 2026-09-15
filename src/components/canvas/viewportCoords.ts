// Screen↔world coordinate conversion, shared by useBoardInteraction.ts and
// useConnectionInteraction.ts — extracted so both hooks convert pointer
// events the same way instead of duplicating the pan/zoom math.

export interface View {
  x: number
  y: number
  zoom: number
}

export function screenPoint(
  clientX: number,
  clientY: number,
  boardRect: DOMRect | undefined,
): { x: number; y: number } {
  return {
    x: clientX - (boardRect?.left ?? 0),
    y: clientY - (boardRect?.top ?? 0),
  }
}

export function worldPoint(
  clientX: number,
  clientY: number,
  boardRect: DOMRect | undefined,
  view: View,
): { x: number; y: number } {
  const { x, y } = screenPoint(clientX, clientY, boardRect)
  return { x: (x - view.x) / view.zoom, y: (y - view.y) / view.zoom }
}
