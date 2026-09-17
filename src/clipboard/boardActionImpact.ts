// The "hidden cost" the confirm modal must surface (multiboard support
// design doc §4): a board node standing in for a whole subtree is exactly
// the situation where the on-screen node count understates the real
// effect of deleting/duplicating/pasting it — "Delete 3 boards (47 nodes
// total)?" rather than just "Delete 3 boards?".

import type { Node } from '../schema/node'

export interface BoardActionImpact {
  /** How many board nodes the action applies to. */
  boardCount: number
  /** Total content nodes across every one of those boards (never recursive — board-in-board nesting is out of scope, design doc §1). */
  nodeCount: number
}

export function computeBoardActionImpact(
  boardRefs: readonly string[],
  allNodes: readonly Node[],
): BoardActionImpact {
  const refSet = new Set(boardRefs)
  const nodeCount = allNodes.filter((node) => refSet.has(node.boardId)).length
  return { boardCount: boardRefs.length, nodeCount }
}
