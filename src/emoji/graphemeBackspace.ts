// Backspace on a multi-codepoint emoji (skin tone + ZWJ-joined profession,
// e.g. "man technologist: medium-dark skin tone") isn't reliably deleted
// as one unit by a plain <textarea>/<input>'s native editing — some
// browsers peel off one ZWJ segment per keystroke (skin tone, then
// profession, then base), which reads as "backspace three times to delete
// one emoji". Typical apps (iMessage, Slack) delete the whole emoji in a
// single backspace instead. `Intl.Segmenter`'s grapheme-cluster boundaries
// already treat these sequences as one grapheme, so useEmojiTrigger.ts
// uses this to compute the deletion range itself and take over the
// keystroke, rather than relying on the field's native behavior.

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The start index of the grapheme cluster immediately before `cursor` (assumes `cursor` sits on a grapheme boundary, true whenever it only ever moved by whole characters/emoji). Returns `cursor` itself if there's nothing before it. */
export function graphemeStartBefore(value: string, cursor: number): number {
  if (cursor <= 0) return 0
  let start = cursor
  for (const { index } of segmenter.segment(value)) {
    if (index >= cursor) break
    start = index
  }
  return start
}
