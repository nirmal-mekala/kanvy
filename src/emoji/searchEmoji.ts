// Ranks/filters the normalized dataset (normalizeEmojiData.ts) against a
// `:query` typed after the trigger colon (emojiTrigger.ts) — name-prefix
// matches first, then any other name/keyword substring match, each group
// in dataset order, capped to `limit` so the dropdown stays scannable.

import type { EmojiEntry } from './emojiTypes'

const DEFAULT_LIMIT = 30

function matchesWordStart(name: string, query: string): boolean {
  return name.split(/[\s-]+/).some((word) => word.startsWith(query))
}

export function searchEmoji(
  query: string,
  entries: readonly EmojiEntry[],
  limit = DEFAULT_LIMIT,
): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const prefixMatches: EmojiEntry[] = []
  const otherMatches: EmojiEntry[] = []

  for (const entry of entries) {
    const name = entry.name.toLowerCase()
    if (name.startsWith(q) || matchesWordStart(name, q)) {
      prefixMatches.push(entry)
      continue
    }
    if (
      name.includes(q) ||
      entry.keywords.some((keyword) => keyword.includes(q))
    ) {
      otherMatches.push(entry)
    }
  }

  return [...prefixMatches, ...otherMatches].slice(0, limit)
}
