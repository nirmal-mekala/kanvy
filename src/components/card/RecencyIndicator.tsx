// Small, non-interactive updated-at label shown in a card/container's drag
// bar while recency view mode is active (spec §6.3) — the border color
// already encodes the same information as one of 4 coarse bands; this adds
// the exact relative time in words, with the full timestamp available via
// the native `title` tooltip on hover. Shared between Card and Container,
// same pattern as TaskStatusIcon.

import { formatRelativeTime } from '../../colors/recency'

export function RecencyIndicator({
  updatedAt,
  now,
  className,
}: {
  updatedAt: string
  now: Date
  className?: string
}) {
  return (
    <span className={className} title={new Date(updatedAt).toLocaleString()}>
      {formatRelativeTime(updatedAt, now)}
    </span>
  )
}
