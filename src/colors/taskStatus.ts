// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §3/§6.1.
// Phase 7 Stage 8 fills in the real logic. Superseded once schema/ (phase 7
// Stage 1) makes TaskStatus a Zod-enum-derived type.

import type { Theme } from './colorKey'

export type TaskStatus = 'todo' | 'blocked' | 'in_progress' | 'done'

/**
 * Fixed 4-color task-status palette, chosen for glyph contrast (spec §3):
 * `todo` neutral (theme-dependent), `blocked` red, `in_progress` blue,
 * `done` green. Only `todo` varies by theme.
 */
export function resolveTaskStatusColor(
  _status: TaskStatus,
  _theme: Theme,
): string {
  throw new Error('not implemented — phase 7')
}
