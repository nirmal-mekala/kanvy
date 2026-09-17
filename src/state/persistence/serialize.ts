// Board -> JSON string, with `images` guaranteed to serialize as the last
// top-level key (spec §2.8) regardless of the source object's own key
// order — an object *literal* (as opposed to a spread of `board`) fixes
// key order at the call site, independent of how `board` was built up.

import type { Board } from '../../schema/board'

export function serializeBoard(board: Board): string {
  return JSON.stringify({
    version: board.version,
    nodes: board.nodes,
    edges: board.edges,
    boards: board.boards,
    images: board.images,
  })
}
