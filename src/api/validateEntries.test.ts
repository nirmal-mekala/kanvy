import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { BoardMetaSchema } from '../schema/boardMeta'
import { ResponseValidationError, validateEntries } from './validateEntries'

const now = '2026-01-01T00:00:00.000Z'

function boardEntry(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    status: 'active',
    isRoot: false,
    createdAt: now,
    updatedAt: now,
    ...extra,
  }
}

function withoutIsRoot(entry: Record<string, unknown>) {
  const { isRoot: _isRoot, ...rest } = entry
  return rest
}

function messageOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(ResponseValidationError)
    return (error as Error).message
  }
  throw new Error('expected validateEntries to throw')
}

describe('validateEntries', () => {
  it('returns the parsed entries when every one is valid', () => {
    const entries = [boardEntry('a', { isRoot: true }), boardEntry('b')]
    expect(validateEntries(BoardMetaSchema, entries, 'GET /boards')).toEqual(
      entries,
    )
  })

  it('names the request, the offending entry id, and the missing field', () => {
    const message = messageOf(() =>
      validateEntries(
        BoardMetaSchema,
        [boardEntry('ok'), withoutIsRoot(boardEntry('legacy'))],
        'GET /boards',
      ),
    )
    expect(message).toMatch(/^GET \/boards returned 1 invalid entry: /)
    expect(message).toContain('id "legacy" (isRoot: ')
    expect(message).toContain('boolean')
    expect(message).not.toContain('"ok"')
  })

  it('accepts an unknown extra field, stripping it from the parsed entry', () => {
    const parsed = validateEntries(
      BoardMetaSchema,
      [boardEntry('a', { isRoot: true, parentId: 'x' })],
      'GET /boards',
    )
    expect(parsed).toEqual([boardEntry('a', { isRoot: true })])
  })

  it('falls back to the entry index when an entry has no id', () => {
    const message = messageOf(() =>
      validateEntries(z.object({ id: z.string() }), [{}, 'nope'], 'GET /x'),
    )
    expect(message).toContain('entry #0')
    expect(message).toContain('entry #1')
    expect(message).toMatch(/returned 2 invalid entries/)
  })

  it('spells out at most three invalid entries and counts the rest', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      withoutIsRoot(boardEntry(id)),
    )
    const message = messageOf(() =>
      validateEntries(BoardMetaSchema, entries, 'GET /boards'),
    )
    expect(message).toMatch(/returned 5 invalid entries/)
    expect(message).toContain('id "c"')
    expect(message).not.toContain('id "d"')
    expect(message).toMatch(/; and 2 more$/)
  })
})
