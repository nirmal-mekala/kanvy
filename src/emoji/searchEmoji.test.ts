import { describe, expect, it } from 'vitest'
import type { EmojiEntry } from './emojiTypes'
import { searchEmoji } from './searchEmoji'

function entry(name: string, keywords: readonly string[] = []): EmojiEntry {
  return {
    id: name,
    char: '🙂',
    name,
    keywords,
    genders: ['neutral'],
    tones: [0],
    variantChars: new Map([['neutral:0', '🙂']]),
  }
}

describe('searchEmoji', () => {
  const entries = [
    entry('grinning face'),
    entry('grimacing face'),
    entry('thumbs up', ['+1', 'like']),
    entry('green heart'),
  ]

  it('returns nothing for an empty query', () => {
    expect(searchEmoji('', entries)).toEqual([])
    expect(searchEmoji('   ', entries)).toEqual([])
  })

  it('ranks name-prefix matches before other matches', () => {
    const results = searchEmoji('gri', entries)
    expect(results.map((e) => e.name)).toEqual([
      'grinning face',
      'grimacing face',
    ])
  })

  it('matches on a later word in the name, not just the start of the whole name', () => {
    const results = searchEmoji('face', entries)
    expect(results.map((e) => e.name).sort()).toEqual([
      'grimacing face',
      'grinning face',
    ])
  })

  it('falls back to keyword matches when nothing matches by name', () => {
    const results = searchEmoji('+1', entries)
    expect(results.map((e) => e.name)).toEqual(['thumbs up'])
  })

  it('is case-insensitive', () => {
    expect(searchEmoji('GRI', entries).map((e) => e.name)).toEqual([
      'grinning face',
      'grimacing face',
    ])
  })

  it('caps results at the given limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => entry(`grin ${i}`))
    expect(searchEmoji('grin', many, 3)).toHaveLength(3)
  })
})
