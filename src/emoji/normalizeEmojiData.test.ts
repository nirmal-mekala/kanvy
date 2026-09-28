import { describe, expect, it } from 'vitest'
import { variantKey } from './emojiTypes'
import {
  analyzeHexcode,
  normalizeEmojiData,
  type RawEmoji,
} from './normalizeEmojiData'

describe('analyzeHexcode', () => {
  it('treats a plain hexcode as neutral with no stripping', () => {
    expect(analyzeHexcode('1F44D')).toEqual({
      gender: 'neutral',
      baseKey: 'zwj:1F44D',
    })
  })

  it('detects a man variant and strips the ZWJ+gender pair', () => {
    expect(analyzeHexcode('1F64B-200D-2642-FE0F')).toEqual({
      gender: 'man',
      baseKey: 'zwj:1F64B',
    })
  })

  it('detects a woman variant and strips the ZWJ+gender pair', () => {
    expect(analyzeHexcode('1F64B-200D-2640-FE0F')).toEqual({
      gender: 'woman',
      baseKey: 'zwj:1F64B',
    })
  })

  it('matches a gendered form back to a base whose FE0F sits before the ZWJ pair (e.g. detective)', () => {
    expect(analyzeHexcode('1F575-FE0F-200D-2642-FE0F')).toEqual({
      gender: 'man',
      baseKey: 'zwj:1F575',
    })
    expect(analyzeHexcode('1F575')).toEqual({
      gender: 'neutral',
      baseKey: 'zwj:1F575',
    })
  })

  it('preserves an unrelated ZWJ sequence that follows the gender pair (facing-right walking)', () => {
    expect(analyzeHexcode('1F6B6-200D-2640-FE0F-200D-27A1-FE0F')).toEqual({
      gender: 'woman',
      baseKey: 'zwj:1F6B6-200D-27A1',
    })
    expect(analyzeHexcode('1F6B6-200D-27A1-FE0F')).toEqual({
      gender: 'neutral',
      baseKey: 'zwj:1F6B6-200D-27A1',
    })
  })

  it('does not misdetect a standalone gender-symbol emoji as a variant', () => {
    expect(analyzeHexcode('2642')).toEqual({
      gender: 'neutral',
      baseKey: 'zwj:2642',
    })
    expect(analyzeHexcode('2640')).toEqual({
      gender: 'neutral',
      baseKey: 'zwj:2640',
    })
  })

  it('detects the person/man/woman base-swap pattern (e.g. technologist)', () => {
    expect(analyzeHexcode('1F9D1-200D-1F4BB')).toEqual({
      gender: 'neutral',
      baseKey: 'role:1F4BB',
    })
    expect(analyzeHexcode('1F468-200D-1F4BB')).toEqual({
      gender: 'man',
      baseKey: 'role:1F4BB',
    })
    expect(analyzeHexcode('1F469-200D-1F4BB')).toEqual({
      gender: 'woman',
      baseKey: 'role:1F4BB',
    })
  })

  it("does not collide a base-swap role's stripped key with an unrelated plain emoji sharing that hexcode", () => {
    // "technologist" strips to the same digits as the bare "laptop" emoji's
    // own hexcode (1F4BB) — the `role:`/`zwj:` prefixes must keep them apart.
    expect(analyzeHexcode('1F4BB').baseKey).not.toBe(
      analyzeHexcode('1F9D1-200D-1F4BB').baseKey,
    )
  })

  it('does not treat a multi-person composite (family/kiss) as a single-person gender variant', () => {
    // "family: man, woman, boy" vs "family: woman, woman, boy" differ in
    // who's in the family, not just a gender toggle on one person — the
    // remainder containing another person/child codepoint (1F467 girl,
    // 1F466 boy, plus the other parent) rules out the base-swap merge.
    const manWomanBoy = analyzeHexcode('1F468-200D-1F469-200D-1F466')
    const womanWomanBoy = analyzeHexcode('1F469-200D-1F469-200D-1F466')
    expect(manWomanBoy.baseKey).not.toBe(womanWomanBoy.baseKey)
  })
})

describe('normalizeEmojiData', () => {
  it('keeps a non-gendered emoji with skin tones as a single entry with tone variants', () => {
    const raw: RawEmoji[] = [
      {
        hexcode: '1F44D',
        label: 'thumbs up',
        unicode: '👍',
        tags: ['+1', 'like'],
        skins: [
          { hexcode: '1F44D-1F3FB', unicode: '👍🏻' },
          { hexcode: '1F44D-1F3FF', unicode: '👍🏿' },
        ],
      },
    ]
    const [entry] = normalizeEmojiData(raw)
    expect(entry).toBeDefined()
    expect(entry?.genders).toEqual(['neutral'])
    expect(entry?.tones).toEqual([0, 1, 5])
    expect(entry?.variantChars.get(variantKey('neutral', 1))).toBe('👍🏻')
    expect(entry?.variantChars.get(variantKey('neutral', 5))).toBe('👍🏿')
  })

  it('merges neutral/man/woman forms of the same emoji into one entry', () => {
    const raw: RawEmoji[] = [
      {
        hexcode: '1F64B',
        label: 'person raising hand',
        unicode: '🙋',
        tags: ['gesture'],
        skins: [{ hexcode: '1F64B-1F3FB', unicode: '🙋🏻' }],
      },
      {
        hexcode: '1F64B-200D-2642-FE0F',
        label: 'man raising hand',
        unicode: '🙋‍♂️',
        tags: ['man'],
        skins: [{ hexcode: '1F64B-1F3FB-200D-2642-FE0F', unicode: '🙋🏻‍♂️' }],
      },
      {
        hexcode: '1F64B-200D-2640-FE0F',
        label: 'woman raising hand',
        unicode: '🙋‍♀️',
        tags: ['woman'],
        skins: [],
      },
    ]
    const entries = normalizeEmojiData(raw)
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    expect(entry?.name).toBe('person raising hand')
    expect(entry?.char).toBe('🙋')
    expect(entry?.genders).toEqual(['neutral', 'man', 'woman'])
    expect(entry?.keywords).toEqual(
      expect.arrayContaining(['gesture', 'man', 'woman']),
    )
    expect(entry?.variantChars.get(variantKey('man', 0))).toBe('🙋‍♂️')
    expect(entry?.variantChars.get(variantKey('woman', 0))).toBe('🙋‍♀️')
    expect(entry?.variantChars.get(variantKey('man', 1))).toBe('🙋🏻‍♂️')
    expect(entry?.tones).toEqual([0, 1])
  })

  it('merges the person/man/woman base-swap pattern into one neutral-primary entry (e.g. technologist)', () => {
    const raw: RawEmoji[] = [
      {
        hexcode: '1F9D1-200D-1F4BB',
        label: 'technologist',
        unicode: '🧑‍💻',
        tags: ['coder'],
      },
      {
        hexcode: '1F468-200D-1F4BB',
        label: 'man technologist',
        unicode: '👨‍💻',
      },
      {
        hexcode: '1F469-200D-1F4BB',
        label: 'woman technologist',
        unicode: '👩‍💻',
      },
    ]
    const entries = normalizeEmojiData(raw)
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    expect(entry?.name).toBe('technologist')
    expect(entry?.char).toBe('🧑‍💻')
    expect(entry?.genders).toEqual(['neutral', 'man', 'woman'])
    expect(entry?.variantChars.get(variantKey('man', 0))).toBe('👨‍💻')
    expect(entry?.variantChars.get(variantKey('woman', 0))).toBe('👩‍💻')
  })

  it('does not merge a bare plain emoji with an unrelated base-swap role that strips to the same digits', () => {
    const raw: RawEmoji[] = [
      { hexcode: '1F4BB', label: 'laptop', unicode: '💻' },
      { hexcode: '1F9D1-200D-1F4BB', label: 'technologist', unicode: '🧑‍💻' },
    ]
    const entries = normalizeEmojiData(raw)
    expect(entries.map((e) => e.name).sort()).toEqual([
      'laptop',
      'technologist',
    ])
  })

  it('keeps multi-person family/kiss compositions as separate entries rather than merging them as gender variants', () => {
    const raw: RawEmoji[] = [
      {
        hexcode: '1F468-200D-1F469-200D-1F466',
        label: 'family: man, woman, boy',
        unicode: '👨‍👩‍👦',
      },
      {
        hexcode: '1F469-200D-1F469-200D-1F466',
        label: 'family: woman, woman, boy',
        unicode: '👩‍👩‍👦',
      },
    ]
    const entries = normalizeEmojiData(raw)
    expect(entries).toHaveLength(2)
  })

  it('keeps standalone gender-symbol emoji as separate single entries, not merged together', () => {
    const raw: RawEmoji[] = [
      { hexcode: '2642', label: 'male sign', unicode: '♂️' },
      { hexcode: '2640', label: 'female sign', unicode: '♀️' },
    ]
    const entries = normalizeEmojiData(raw)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.name).sort()).toEqual([
      'female sign',
      'male sign',
    ])
  })
})
