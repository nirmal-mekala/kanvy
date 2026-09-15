import { describe, expect, it } from 'vitest'
import { resolveRecencyColor } from './recency'

const now = new Date('2026-09-15T12:00:00.000Z')

function hoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
}

describe('resolveRecencyColor', () => {
  it('resolves to lime within 1 day', () => {
    expect(resolveRecencyColor(hoursAgo(1), now)).toBe('lime')
  })

  it('resolves to amber within 1 week (but past 1 day)', () => {
    expect(resolveRecencyColor(hoursAgo(3 * 24), now)).toBe('amber')
  })

  it('resolves to orange within 1 month (but past 1 week)', () => {
    expect(resolveRecencyColor(hoursAgo(14 * 24), now)).toBe('orange')
  })

  it('resolves to coral beyond 1 month', () => {
    expect(resolveRecencyColor(hoursAgo(60 * 24), now)).toBe('coral')
  })
})
