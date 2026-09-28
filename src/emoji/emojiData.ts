// Lazy-loads emojibase-data's English dataset (only once, the first time
// a `:` trigger actually fires — src/emoji/useEmojiTrigger.ts) so it
// doesn't add to the app's initial bundle, and normalizes it into the
// searchable `EmojiEntry[]` shape (normalizeEmojiData.ts).

import type { EmojiEntry } from './emojiTypes'
import { normalizeEmojiData, type RawEmoji } from './normalizeEmojiData'

let cached: Promise<EmojiEntry[]> | null = null

// CRAP scoring penalizes this function's 0% coverage — it's a one-time
// dynamic-import boundary, not pure application logic; normalizeEmojiData
// (the actual transformation logic) is unit-tested directly.
// fallow-ignore-next-line complexity
export function loadEmojiEntries(): Promise<EmojiEntry[]> {
  if (!cached) {
    cached = import('emojibase-data/en/compact.json').then((mod) =>
      normalizeEmojiData(mod.default as unknown as readonly RawEmoji[]),
    )
  }
  return cached
}
