import { describe, expect, it } from 'vitest'
import {
  deriveSaveDots,
  MAX_SAVE_DOTS,
  noteResolved,
  RESOLVED_LINGER_MS,
  type SaveMutationSnapshot,
} from './saveIndicator'

function pending(
  id: number,
  isPaused = false,
  failureCount = 0,
): SaveMutationSnapshot {
  return { id, status: 'pending', isPaused, failureCount }
}

function success(id: number): SaveMutationSnapshot {
  return { id, status: 'success', isPaused: false, failureCount: 0 }
}

function states(mutations: SaveMutationSnapshot[], held = false, now = 0) {
  const resolvedAt = noteResolved(mutations, new Map(), now)
  return deriveSaveDots(mutations, resolvedAt, held, now).dots.map(
    (d) => d.state,
  )
}

describe('deriveSaveDots', () => {
  it('shows nothing when there is nothing to save', () => {
    expect(deriveSaveDots([], new Map(), false, 0)).toEqual({
      dots: [],
      overflow: 0,
      nextExpiryAt: undefined,
    })
  })

  it('maps the running save to in-flight and scope-blocked ones to queued', () => {
    expect(states([pending(1), pending(2, true), pending(3, true)])).toEqual([
      'in-flight',
      'queued',
      'queued',
    ])
  })

  it('shows a save that has failed as retrying, paused or not', () => {
    expect(states([pending(1, false, 1), pending(2, true)])).toEqual([
      'retrying',
      'queued',
    ])
    // TanStack Query pauses a retry while the tab is unfocused.
    expect(states([pending(1, true, 3)])).toEqual(['retrying'])
  })

  it('adds the debounced batch as the newest queued dot', () => {
    const { dots } = deriveSaveDots([pending(1)], new Map(), true, 0)
    expect(dots).toEqual([
      { key: '1', state: 'in-flight' },
      { key: 'held', state: 'queued' },
    ])
  })

  it('keeps a resolved dot for the linger window, then drops it', () => {
    const mutations = [success(1), pending(2)]
    const resolvedAt = noteResolved(mutations, new Map(), 1000)
    const during = deriveSaveDots(mutations, resolvedAt, false, 1500)
    expect(during.dots.map((d) => d.state)).toEqual(['resolved', 'in-flight'])
    expect(during.nextExpiryAt).toBe(1000 + RESOLVED_LINGER_MS)

    const after = deriveSaveDots(
      mutations,
      resolvedAt,
      false,
      1000 + RESOLVED_LINGER_MS,
    )
    expect(after.dots.map((d) => d.state)).toEqual(['in-flight'])
    expect(after.nextExpiryAt).toBeUndefined()
  })

  it('reports the earliest expiry among resolved dots', () => {
    const resolvedAt = new Map([
      [1, 500],
      [2, 100],
    ])
    expect(
      deriveSaveDots([success(1), success(2)], resolvedAt, false, 200)
        .nextExpiryAt,
    ).toBe(100 + RESOLVED_LINGER_MS)
  })

  it('ignores error and idle mutations', () => {
    expect(
      states([
        { id: 1, status: 'error', isPaused: false, failureCount: 1 },
        { id: 2, status: 'idle', isPaused: false, failureCount: 0 },
      ]),
    ).toEqual([])
  })

  it('drops the oldest resolved dots first when over the cap', () => {
    const resolvedIds = Array.from({ length: MAX_SAVE_DOTS }, (_, i) => i)
    const mutations = [
      ...resolvedIds.map(success),
      pending(100),
      pending(101, true),
    ]
    const { dots, overflow } = deriveSaveDots(
      mutations,
      noteResolved(mutations, new Map(), 0),
      false,
      0,
    )
    expect(dots).toHaveLength(MAX_SAVE_DOTS)
    expect(overflow).toBe(0)
    expect(dots[0]).toEqual({ key: '2', state: 'resolved' })
    expect(dots.slice(-2).map((d) => d.state)).toEqual(['in-flight', 'queued'])
  })

  it('counts unresolved saves past the cap as overflow', () => {
    const mutations = Array.from({ length: MAX_SAVE_DOTS + 3 }, (_, i) =>
      pending(i, i > 0),
    )
    const { dots, overflow } = deriveSaveDots(mutations, new Map(), true, 0)
    expect(dots).toHaveLength(MAX_SAVE_DOTS)
    expect(dots.every((d) => d.state !== 'resolved')).toBe(true)
    expect(overflow).toBe(4)
  })
})

describe('noteResolved', () => {
  it('records only the first time a success is seen', () => {
    const resolvedAt = noteResolved([success(1), pending(2)], new Map(), 10)
    noteResolved([success(1), success(2)], resolvedAt, 20)
    expect([...resolvedAt]).toEqual([
      [1, 10],
      [2, 20],
    ])
  })

  it('can mark already-landed saves as expired', () => {
    const resolvedAt = noteResolved([success(1)], new Map(), -Infinity)
    expect(deriveSaveDots([success(1)], resolvedAt, false, 0).dots).toEqual([])
  })
})
