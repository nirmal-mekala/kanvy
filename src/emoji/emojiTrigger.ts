// Detects a Slack-style `:query` trigger ending at the cursor: a colon
// preceded by start-of-string or whitespace, followed by a contiguous run
// of non-whitespace characters (no nested colon) up to the cursor. Pure
// and DOM-free so it's unit-testable on its own — useEmojiTrigger.ts is
// the only caller, feeding it the field's live value/selectionStart.

export interface EmojiTriggerMatch {
  /** Index of the triggering `:` in `value`. */
  start: number
  /** Cursor position the match was computed at (exclusive end of the query). */
  end: number
  query: string
}

export function findEmojiTrigger(
  value: string,
  cursor: number,
): EmojiTriggerMatch | null {
  if (cursor < 0 || cursor > value.length) return null

  let start = -1
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === ':') {
      start = i
      break
    }
    if (ch === undefined || /\s/.test(ch)) return null
  }
  if (start === -1) return null

  const before = value[start - 1]
  if (before !== undefined && !/\s/.test(before)) return null

  return { start, end: cursor, query: value.slice(start + 1, cursor) }
}
