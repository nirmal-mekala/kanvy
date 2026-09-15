// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §6.3.
// Phase 7 Stage 8 fills in the real logic. Thresholds are fixed constants,
// not user-configurable (spec §6.3/Q9) — kept as-is, a documented wart.

export type RecencyColorKey = 'lime' | 'amber' | 'orange' | 'coral'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * ONE_DAY_MS
const ONE_MONTH_MS = 30 * ONE_DAY_MS

/**
 * Resolves the recency-mode border color for a node last touched at
 * `updatedAt`, evaluated against `now`: ≤1 day → lime, ≤1 week → amber,
 * ≤1 month → orange, older → coral (spec §6.3).
 */
export function resolveRecencyColor(
  updatedAt: string,
  now: Date,
): RecencyColorKey {
  const elapsed = now.getTime() - new Date(updatedAt).getTime()
  if (elapsed <= ONE_DAY_MS) return 'lime'
  if (elapsed <= ONE_WEEK_MS) return 'amber'
  if (elapsed <= ONE_MONTH_MS) return 'orange'
  return 'coral'
}
