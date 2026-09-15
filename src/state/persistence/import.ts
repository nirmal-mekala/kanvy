// JSON import/export (spec §9 Q14, §2.8). Shares the legacy-normalize +
// Zod-validate pipeline with `storage.ts`'s localStorage load, so a
// hand-edited or prototype-era export file is just as forgiving as a
// legacy localStorage board. Builds a result a later UI stage can use to
// render the import-failure modal/toast — this module has no UI itself.

import type { Board } from '../../schema/board'
import { BoardSchema } from '../../schema/board'
import { normalizeLegacyBoard } from '../../schema/legacy'
import { serializeBoard } from './serialize'

export type ImportResult =
  | { ok: true; board: Board }
  | { ok: false; reason: 'parse-error' | 'validation-error' }

/** Parses+validates a JSON export/import file's contents into a Board. */
export function parseImportedBoard(json: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'parse-error' }
  }

  const result = BoardSchema.safeParse(normalizeLegacyBoard(parsed))
  if (!result.success) {
    return { ok: false, reason: 'validation-error' }
  }
  return { ok: true, board: result.data }
}

/** Serializes a board for a JSON export download. */
export function exportBoard(board: Board): string {
  return serializeBoard(board)
}
