import { describe, expect, it } from 'vitest'
import {
  detectSlurpOnBlur,
  detectSlurpOnType,
  findFirstUrl,
  isPlainUrl,
} from './urlSlurp'

describe('findFirstUrl', () => {
  it('finds the only URL in text', () => {
    expect(findFirstUrl('check https://example.com out')?.url).toBe(
      'https://example.com',
    )
  })

  it('finds only the first URL when there are several', () => {
    expect(findFirstUrl('https://a.com and https://b.com')?.url).toBe(
      'https://a.com',
    )
  })

  it('returns undefined when there is no URL', () => {
    expect(findFirstUrl('just plain text')).toBeUndefined()
  })
})

describe('isPlainUrl', () => {
  it('is true for a bare URL', () => {
    expect(isPlainUrl('https://example.com')).toBe(true)
  })

  it('is true for a URL with surrounding whitespace', () => {
    expect(isPlainUrl('  https://example.com  ')).toBe(true)
  })

  it('is false when there is other text', () => {
    expect(isPlainUrl('see https://example.com')).toBe(false)
  })
})

describe('detectSlurpOnType', () => {
  it('triggers the moment a space is typed immediately after the first URL', () => {
    const text = 'hello https://example.com '
    const match = detectSlurpOnType(text, text.length)
    expect(match?.url).toBe('https://example.com')
    expect(match?.remainingText).toBe('hello ')
  })

  it('does not trigger when the just-typed space does not follow a URL', () => {
    const text = 'hello world '
    expect(detectSlurpOnType(text, text.length)).toBeUndefined()
  })

  it('does not slurp a second URL typed after the first', () => {
    const text = 'https://a.com then https://b.com '
    // The first URL was already slurped in an earlier keystroke in real
    // usage; here we assert the detector only ever matches the *first*
    // URL in whatever text it's given, never a later one.
    const match = detectSlurpOnType(text, text.length)
    expect(match?.url).toBe('https://a.com')
  })
})

describe('detectSlurpOnBlur', () => {
  it('triggers when the URL is the last thing in the text', () => {
    const match = detectSlurpOnBlur('hello https://example.com')
    expect(match?.url).toBe('https://example.com')
    expect(match?.remainingText).toBe('hello')
  })

  it('does not trigger when there is text after the URL', () => {
    expect(detectSlurpOnBlur('hello https://example.com world')).toBeUndefined()
  })

  it('does not trigger when there is no URL', () => {
    expect(detectSlurpOnBlur('just plain text')).toBeUndefined()
  })
})
