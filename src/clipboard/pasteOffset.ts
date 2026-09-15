// Staircase-then-push paste placement (spec §7) — ported from the
// prototype's `pasteClipboard` (ctx/support/260915-prototype-source/src/state/useBoard.js).
// A repeated paste of the same copy offsets a bit further (a staircase,
// matching repeated ⌘/Ctrl+D); if that would still land the paste
// overlapping any existing container, it's pushed further out along the
// same diagonal until clear of all of them — a paste never lands "inside"
// a container (spec §2.3/§7).

import { overlapArea } from '../geometry/containment'
import type { Rect } from '../geometry/snap'
import { GRID_SIZE } from '../geometry/snap'

const STAIRCASE_STEP = GRID_SIZE * 2
const PUSH_STEP = GRID_SIZE * 4
const MAX_PUSH_ATTEMPTS = 40

/**
 * The (x, y) offset to apply to every pasted node's original position —
 * `pasteCount` is the number of times this same copy has already been
 * pasted (0 for the first paste).
 */
export function computePasteOffset(
  pasteCount: number,
  clipBox: Rect,
  containers: readonly Rect[],
): number {
  let offset = STAIRCASE_STEP * pasteCount
  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
    const candidate: Rect = {
      x: clipBox.x + offset,
      y: clipBox.y + offset,
      w: clipBox.w,
      h: clipBox.h,
    }
    const overlapsAnyContainer = containers.some(
      (container) => overlapArea(candidate, container) > 0,
    )
    if (!overlapsAnyContainer) break
    offset += PUSH_STEP
  }
  return offset
}
