import { describe, expect, it } from 'vitest'
import { computeSelectionAfterClick } from './selection'

describe('computeSelectionAfterClick', () => {
  it('selects only the clicked id by default', () => {
    expect(computeSelectionAfterClick(new Set(['a']), 'b', false)).toEqual(
      new Set(['b']),
    )
  })

  it('toggles the id on when additive and not already selected', () => {
    expect(computeSelectionAfterClick(new Set(['a']), 'b', true)).toEqual(
      new Set(['a', 'b']),
    )
  })

  it('toggles the id off when additive and already selected', () => {
    expect(computeSelectionAfterClick(new Set(['a', 'b']), 'b', true)).toEqual(
      new Set(['a']),
    )
  })

  it('preserves an existing multi-selection on a plain click of a member', () => {
    const current = new Set(['a', 'b', 'c'])
    expect(computeSelectionAfterClick(current, 'b', false)).toEqual(current)
  })

  it('collapses to just the clicked id on a plain click of a single-selected item', () => {
    expect(computeSelectionAfterClick(new Set(['a']), 'a', false)).toEqual(
      new Set(['a']),
    )
  })
})
