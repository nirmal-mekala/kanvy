import { describe, expect, it } from 'vitest'
import { findEmojiTrigger } from './emojiTrigger'

describe('findEmojiTrigger', () => {
  it('matches a colon at the start of the text', () => {
    expect(findEmojiTrigger(':gri', 4)).toEqual({
      start: 0,
      end: 4,
      query: 'gri',
    })
  })

  it('matches a colon mid-word after whitespace', () => {
    expect(findEmojiTrigger('hello :gri', 10)).toEqual({
      start: 6,
      end: 10,
      query: 'gri',
    })
  })

  it('matches an empty query right after typing the colon', () => {
    expect(findEmojiTrigger('hello :', 7)).toEqual({
      start: 6,
      end: 7,
      query: '',
    })
  })

  it('returns null when the colon is not preceded by whitespace or start-of-string', () => {
    expect(findEmojiTrigger('http://x', 5)).toBeNull()
  })

  it('returns null when whitespace breaks the run between the colon and the cursor', () => {
    expect(findEmojiTrigger(':gri no', 7)).toBeNull()
  })

  it('uses the closest colon when there are multiple', () => {
    expect(findEmojiTrigger(':foo :gri', 9)).toEqual({
      start: 5,
      end: 9,
      query: 'gri',
    })
  })

  it('returns null when there is no colon on the current line before the cursor', () => {
    expect(findEmojiTrigger('just some text', 14)).toBeNull()
  })

  it('returns null for an out-of-range cursor', () => {
    expect(findEmojiTrigger('abc', -1)).toBeNull()
    expect(findEmojiTrigger('abc', 10)).toBeNull()
  })
})
