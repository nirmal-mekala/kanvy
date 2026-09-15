import { describe, expect, it } from 'vitest'
import { commonValue } from './commonValue'

describe('commonValue', () => {
  it('is null for an empty list', () => {
    expect(commonValue([])).toBeNull()
  })

  it('returns the shared value when every item agrees', () => {
    expect(commonValue(['a', 'a', 'a'])).toBe('a')
  })

  it('is null when items disagree', () => {
    expect(commonValue(['a', 'b'])).toBeNull()
  })

  it('returns the single value for a one-item list', () => {
    expect(commonValue([42])).toBe(42)
  })
})
