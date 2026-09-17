// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §6.3.
// Phase 7 Stage 8 fills in the real logic. Thresholds are fixed constants,
// not user-configurable (spec §6.3/Q9) — kept as-is, a documented wart.

export type RecencyColorKey = 'lime' | 'amber' | 'orange' | 'coral'

const ONE_MINUTE_MS = 60 * 1000
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const ONE_DAY_MS = 24 * ONE_HOUR_MS
const ONE_WEEK_MS = 7 * ONE_DAY_MS
const ONE_MONTH_MS = 30 * ONE_DAY_MS
const ONE_YEAR_MS = 365 * ONE_DAY_MS

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

/**
 * Short, human-readable relative time for the recency-mode indicator (spec
 * §6.3) — "3h ago", "2d ago", "3w ago". Purely cosmetic labeling alongside
 * the border color above; not part of the color-threshold logic.
 */
export function formatRelativeTime(updatedAt: string, now: Date): string {
  const elapsed = now.getTime() - new Date(updatedAt).getTime()
  if (elapsed < ONE_MINUTE_MS) return 'just now'
  if (elapsed < ONE_HOUR_MS)
    return `${Math.floor(elapsed / ONE_MINUTE_MS)}m ago`
  if (elapsed < ONE_DAY_MS) return `${Math.floor(elapsed / ONE_HOUR_MS)}h ago`
  if (elapsed < ONE_WEEK_MS) return `${Math.floor(elapsed / ONE_DAY_MS)}d ago`
  if (elapsed < ONE_MONTH_MS) return `${Math.floor(elapsed / ONE_WEEK_MS)}w ago`
  if (elapsed < ONE_YEAR_MS)
    return `${Math.floor(elapsed / ONE_MONTH_MS)}mo ago`
  return `${Math.floor(elapsed / ONE_YEAR_MS)}y ago`
}
