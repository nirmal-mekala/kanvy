// Zod schema for a `boards` collection entry (schema v3) — metadata only,
// per ctx/notes/260917-multiboard-support-design.md §2. Content (nodes/
// edges) lives in the shared, `boardId`-scoped `nodes`/`edges` arrays
// (schema/node.ts, schema/edge.ts), never here.
//
// Schema v6 (ctx/notes/261006-root-board-isroot.md): the home board is
// designated by a required `isRoot` flag, not a reserved id — its id is an
// ordinary generated one like every other board's.

import { z } from 'zod'

export const BoardIdSchema = z.string()
// fallow-ignore-next-line unused-type
export type BoardId = z.infer<typeof BoardIdSchema>

export const BoardMetaSchema = z.object({
  id: BoardIdSchema,
  title: z.string(),
  status: z.enum(['active', 'trashed']),
  /** True for exactly one board per document: the always-present, non-deletable home board (design doc §2). */
  isRoot: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
// fallow-ignore-next-line unused-type
export type BoardMeta = z.infer<typeof BoardMetaSchema>

/**
 * Every way `boards` violates the root-board invariant — exactly one
 * entry with `isRoot: true`, and that entry not trashed. Empty when the
 * invariant holds. Shared by `BoardSchema`'s refinement (localStorage
 * load) and network mode's `GET /boards` validation, so both report the
 * same problems in the same words.
 */
export function rootBoardIssues(
  boards: readonly Pick<BoardMeta, 'id' | 'isRoot' | 'status'>[],
): string[] {
  const roots = boards.filter((board) => board.isRoot)
  if (roots.length === 0) {
    return ['no board has isRoot: true — exactly one root board is required']
  }
  if (roots.length > 1) {
    const ids = roots.map((board) => `"${board.id}"`).join(', ')
    return [
      `${roots.length} boards have isRoot: true (${ids}) — exactly one root board is allowed`,
    ]
  }
  const [root] = roots
  if (root?.status === 'trashed') {
    return [
      `root board "${root.id}" is trashed — the root board must be active`,
    ]
  }
  return []
}

/**
 * The root board's id. Throws if there isn't one — every document that
 * reaches app state has already passed `rootBoardIssues` (via
 * `BoardSchema` or network mode's boards validation), so a missing root
 * here is a broken invariant, not a recoverable condition.
 */
export function rootBoardId(boards: readonly BoardMeta[]): string {
  const root = boards.find((board) => board.isRoot)
  if (!root) throw new Error('Invariant violated: no root board (isRoot: true)')
  return root.id
}

/**
 * Placeholder `boardId` for a node/edge built before it's added to a
 * board — the factories in cards/newCard.ts, containers/createContainer.ts
 * etc. don't know the current board, and the add atoms (state/atoms/
 * nodes.ts's `addNodeAtom`/`addNodesAtom`, edges.ts's `addEdgeAtom`)
 * always overwrite it with the real one. Never persisted; deliberately
 * not a valid board id.
 */
export const UNASSIGNED_BOARD_ID = ''
