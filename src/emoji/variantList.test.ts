import { describe, expect, it } from 'vitest'
import type { EmojiEntry } from './emojiTypes'
import { buildVariantGrid, findDefaultCell, hasVariants } from './variantList'

const family: EmojiEntry = {
  id: '1F64B',
  char: '🙋',
  name: 'person raising hand',
  keywords: [],
  genders: ['neutral', 'man', 'woman'],
  tones: [0, 1],
  variantChars: new Map([
    ['neutral:0', '🙋'],
    ['neutral:1', '🙋🏻'],
    ['man:0', '🙋‍♂️'],
    ['man:1', '🙋🏻‍♂️'],
    ['woman:0', '🙋‍♀️'],
    // woman:1 deliberately missing, to test partial coverage
  ]),
}

const single: EmojiEntry = {
  id: '1F600',
  char: '😀',
  name: 'grinning face',
  keywords: [],
  genders: ['neutral'],
  tones: [0],
  variantChars: new Map([['neutral:0', '😀']]),
}

describe('hasVariants', () => {
  it('is true when there is more than one gender or tone', () => {
    expect(hasVariants(family)).toBe(true)
  })

  it('is false for an emoji with only the default neutral/tone-0 form', () => {
    expect(hasVariants(single)).toBe(false)
  })
})

describe('buildVariantGrid', () => {
  it('lays out genders as rows and tones as columns', () => {
    const grid = buildVariantGrid(family)
    expect(grid.genders).toEqual(['neutral', 'man', 'woman'])
    expect(grid.tones).toEqual([0, 1])
    expect(grid.cells).toHaveLength(3)
    expect(grid.cells[0]).toEqual([
      { gender: 'neutral', tone: 0, char: '🙋' },
      { gender: 'neutral', tone: 1, char: '🙋🏻' },
    ])
    expect(grid.cells[1]).toEqual([
      { gender: 'man', tone: 0, char: '🙋‍♂️' },
      { gender: 'man', tone: 1, char: '🙋🏻‍♂️' },
    ])
  })

  it('leaves a gap as null when a gender x tone combination has no char', () => {
    const grid = buildVariantGrid(family)
    expect(grid.cells[2]).toEqual([
      { gender: 'woman', tone: 0, char: '🙋‍♀️' },
      null,
    ])
  })
})

describe('findDefaultCell', () => {
  it('finds the row/col matching the preferred gender/tone', () => {
    const grid = buildVariantGrid(family)
    expect(findDefaultCell(grid, { gender: 'man', tone: 1 })).toEqual({
      row: 1,
      col: 1,
    })
  })

  it('falls back to col 0 when the preferred tone has no match, keeping the matched gender row', () => {
    const grid = buildVariantGrid(family)
    expect(findDefaultCell(grid, { gender: 'woman', tone: 5 })).toEqual({
      row: 2,
      col: 0,
    })
  })

  it('falls back to row 0 / col 0 when neither the gender nor the tone matches', () => {
    const grid = buildVariantGrid(single)
    expect(findDefaultCell(grid, { gender: 'man', tone: 5 })).toEqual({
      row: 0,
      col: 0,
    })
  })
})
