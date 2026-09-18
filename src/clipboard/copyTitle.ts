// Naming for board duplication (⌘/Ctrl+D, ⌘/Ctrl+C+V) — appends " - Copy"
// (then " - Copy 2", " - Copy 3", ...) to a duplicated board's title,
// picking the lowest number not already in use among same-based sibling
// titles. Duplicating an existing "X - Copy N" targets the same base "X"
// rather than stacking suffixes, and a since-deleted "X - Copy 2" makes
// that number available again for the next duplicate.

const COPY_SUFFIX_PATTERN = / - Copy(?: (\d+))?$/

function baseTitle(title: string): string {
  return title.replace(COPY_SUFFIX_PATTERN, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Computes the next available "<base> - Copy[ N]" title for duplicating
 * `sourceTitle`, given the titles already present (`existingTitles`).
 */
export function nextCopyTitle(
  sourceTitle: string,
  existingTitles: readonly string[],
): string {
  const base = baseTitle(sourceTitle)
  const siblingPattern = new RegExp(
    `^${escapeRegExp(base)} - Copy(?: (\\d+))?$`,
  )

  const takenNumbers = new Set<number>()
  for (const title of existingTitles) {
    const match = title.match(siblingPattern)
    if (!match) continue
    takenNumbers.add(match[1] ? Number(match[1]) : 1)
  }

  let n = 1
  while (takenNumbers.has(n)) n++

  return n === 1 ? `${base} - Copy` : `${base} - Copy ${n}`
}
