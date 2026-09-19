import { describe, expect, it } from 'vitest'
import {
  type ColorKey,
  isThemeDynamic,
  resolveColorHex,
  swatchBackground,
} from './colorKey'

const nonGrayColors: ColorKey[] = [
  'coral',
  'orange',
  'amber',
  'lime',
  'teal',
  'sky',
  'violet',
  'pink',
]

describe('resolveColorHex', () => {
  it('resolves gray to a distinct hex per theme', () => {
    expect(resolveColorHex('gray', 'light')).not.toBe(
      resolveColorHex('gray', 'dark'),
    )
  })

  it.each(nonGrayColors)(
    'resolves %s to the same hex in both themes',
    (color) => {
      expect(resolveColorHex(color, 'light')).toBe(
        resolveColorHex(color, 'dark'),
      )
    },
  )

  it('returns a valid-looking hex string', () => {
    expect(resolveColorHex('coral', 'light')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('isThemeDynamic', () => {
  it('is true only for gray', () => {
    expect(isThemeDynamic('gray')).toBe(true)
    for (const color of nonGrayColors) {
      expect(isThemeDynamic(color)).toBe(false)
    }
  })
})

describe('swatchBackground', () => {
  it('is a split gradient for gray', () => {
    expect(swatchBackground('gray')).toMatch(/^linear-gradient\(/)
  })

  it.each(nonGrayColors)('is a plain hex fill for %s', (color) => {
    expect(swatchBackground(color)).toBe(resolveColorHex(color, 'light'))
  })
})
