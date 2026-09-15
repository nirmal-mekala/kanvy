// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §6.3.
// Phase 7 Stage 8 fills in the real logic. Thresholds are fixed constants,
// not user-configurable (spec §6.3/Q9) — kept as-is, a documented wart.

export type RecencyColorKey = 'lime' | 'amber' | 'orange' | 'coral'

/**
 * Resolves the recency-mode border color for a node last touched at
 * `updatedAt`, evaluated against `now`: ≤1 day → lime, ≤1 week → amber,
 * ≤1 month → orange, older → coral (spec §6.3).
 */
export function resolveRecencyColor(
  _updatedAt: string,
  _now: Date,
): RecencyColorKey {
  throw new Error('not implemented — phase 7')
}
