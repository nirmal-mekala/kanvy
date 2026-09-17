import { describe, expect, it } from 'vitest'
import { formatRelativeTime, resolveRecencyColor } from './recency'

const now = new Date('2026-09-15T12:00:00.000Z')

function hoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
}

function minutesAgo(minutes: number): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString()
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

describe('formatRelativeTime', () => {
  it('labels sub-minute elapsed time as "just now"', () => {
    expect(formatRelativeTime(minutesAgo(0.5), now)).toBe('just now')
  })

  it('labels minutes', () => {
    expect(formatRelativeTime(minutesAgo(5), now)).toBe('5m ago')
  })

  it('labels hours', () => {
    expect(formatRelativeTime(hoursAgo(3), now)).toBe('3h ago')
  })

  it('labels days', () => {
    expect(formatRelativeTime(hoursAgo(2 * 24), now)).toBe('2d ago')
  })

  it('labels weeks', () => {
    expect(formatRelativeTime(hoursAgo(3 * 7 * 24), now)).toBe('3w ago')
  })

  it('labels months', () => {
    expect(formatRelativeTime(hoursAgo(2 * 30 * 24), now)).toBe('2mo ago')
  })

  it('labels years', () => {
    expect(formatRelativeTime(hoursAgo(2 * 365 * 24), now)).toBe('2y ago')
  })
})
