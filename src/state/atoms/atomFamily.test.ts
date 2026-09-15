import { describe, expect, it, vi } from 'vitest'
import { atomFamily } from './atomFamily'

describe('atomFamily', () => {
  it('returns the same value for the same param', () => {
    const create = vi.fn((id: string) => ({ id }))
    const family = atomFamily(create)
    expect(family('a')).toBe(family('a'))
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('creates a distinct value per distinct param', () => {
    const family = atomFamily((id: string) => ({ id }))
    expect(family('a')).not.toBe(family('b'))
  })
})
