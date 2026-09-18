import { describe, expect, it } from 'vitest'
import { nextCopyTitle } from './copyTitle'

describe('nextCopyTitle', () => {
  it('appends " - Copy" when no sibling copy exists', () => {
    expect(nextCopyTitle('Board', [])).toBe('Board - Copy')
    expect(nextCopyTitle('Board', ['Board', 'Other board'])).toBe(
      'Board - Copy',
    )
  })

  it('numbers the next copy starting at 2', () => {
    expect(nextCopyTitle('Board', ['Board', 'Board - Copy'])).toBe(
      'Board - Copy 2',
    )
    expect(
      nextCopyTitle('Board', ['Board', 'Board - Copy', 'Board - Copy 2']),
    ).toBe('Board - Copy 3')
  })

  it('picks the lowest available number, not just the next one', () => {
    expect(
      nextCopyTitle('Board', ['Board', 'Board - Copy', 'Board - Copy 3']),
    ).toBe('Board - Copy 2')
  })

  it('ignores unrelated titles that merely contain the base as a substring', () => {
    expect(
      nextCopyTitle('Board', ['Board', 'My Board - Copy', 'Board 2 - Copy']),
    ).toBe('Board - Copy')
  })

  it('targets the same base when duplicating an existing copy, not stacking suffixes', () => {
    expect(nextCopyTitle('Board - Copy', ['Board', 'Board - Copy'])).toBe(
      'Board - Copy 2',
    )
    expect(
      nextCopyTitle('Board - Copy 2', [
        'Board',
        'Board - Copy',
        'Board - Copy 2',
      ]),
    ).toBe('Board - Copy 3')
  })

  it('escapes regex-special characters in the base title', () => {
    expect(nextCopyTitle('Q&A (v1)', ['Q&A (v1)', 'Q&A (v1) - Copy'])).toBe(
      'Q&A (v1) - Copy 2',
    )
  })
})
