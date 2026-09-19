import { describe, expect, it } from 'vitest'
import { resolveColorHex } from './colorKey'
import { patternBackgroundImage } from './patterns'

describe('patternBackgroundImage', () => {
  it('returns undefined for the plain "none" pattern', () => {
    expect(
      patternBackgroundImage('none', resolveColorHex('gray', 'dark')),
    ).toBeUndefined()
  })

  it('tints the pattern with whatever colorHex it is given', () => {
    const grayImage = patternBackgroundImage(
      'diagonal',
      resolveColorHex('gray', 'dark'),
    )
    const coralImage = patternBackgroundImage(
      'diagonal',
      resolveColorHex('coral', 'dark'),
    )
    expect(grayImage).toBeDefined()
    expect(coralImage).toBeDefined()
    expect(grayImage).not.toBe(coralImage)
  })
})
