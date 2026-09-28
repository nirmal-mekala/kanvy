import { describe, expect, it } from 'vitest'
import { graphemeStartBefore } from './graphemeBackspace'

describe('graphemeStartBefore', () => {
  it('returns 0 for a cursor at the very start', () => {
    expect(graphemeStartBefore('hello', 0)).toBe(0)
  })

  it('steps back one code unit for plain ASCII', () => {
    expect(graphemeStartBefore('hello', 5)).toBe(4)
  })

  it('treats a simple surrogate-pair emoji as one grapheme', () => {
    const value = 'hi 😀'
    expect(graphemeStartBefore(value, value.length)).toBe(value.length - 2)
  })

  it('treats a skin-tone + ZWJ-joined profession emoji as one grapheme', () => {
    // "man technologist: medium-dark skin tone" — 4 codepoints (person,
    // skin-tone modifier, ZWJ, laptop), the exact case a naive
    // one-codepoint-at-a-time backspace splits into 2-3 keystrokes.
    const emoji = '🧑🏾‍💻'
    const value = `hello ${emoji}`
    expect(graphemeStartBefore(value, value.length)).toBe(
      value.length - emoji.length,
    )
  })

  it('deletes only the emoji, not the preceding text, when the cursor sits right after it', () => {
    const emoji = '👍🏻'
    const value = `${emoji}!`
    const cursor = emoji.length // right after the emoji, before "!"
    expect(graphemeStartBefore(value, cursor)).toBe(0)
  })
})
