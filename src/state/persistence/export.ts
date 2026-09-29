// JSON export (spec §2.8).

import type { Board } from '../../schema/board'
import { serializeBoard } from './serialize'

/** Serializes a board for a JSON export download. */
export function exportBoard(board: Board): string {
  return serializeBoard(board)
}
