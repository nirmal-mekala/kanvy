import { describe, expect, it } from 'vitest'
import {
  COALESCE_MS,
  createHistoryState,
  MAX_HISTORY,
  pushUpdate,
  redo,
  undo,
} from './reducer'

// A base far from 0 — `lastActionAt` starts at 0, so a first update at a
// small `now` could spuriously look "coalesced" with the initial state.
// Real usage always calls with `Date.now()`, which is nowhere near 0.
const T0 = 1_000_000

describe('pushUpdate', () => {
  it('records a new step and clears future', () => {
    let history = createHistoryState(0)
    history = pushUpdate(history, 1, T0)
    history = { ...history, future: [{ state: 99 }] }
    history = pushUpdate(history, 2, T0 + COALESCE_MS + 1)
    expect(history.present.state).toBe(2)
    expect(history.future).toEqual([])
    expect(history.past.map((e) => e.state)).toEqual([0, 1])
  })

  it('coalesces updates within the coalesce window into one step', () => {
    let history = createHistoryState(0)
    history = pushUpdate(history, 1, T0)
    history = pushUpdate(history, 2, T0 + 100)
    history = pushUpdate(history, 3, T0 + 200)
    expect(history.present.state).toBe(3)
    expect(history.past.map((e) => e.state)).toEqual([0])
  })

  it('starts a new step after the coalesce window elapses', () => {
    let history = createHistoryState(0)
    history = pushUpdate(history, 1, T0)
    history = pushUpdate(history, 2, T0 + COALESCE_MS + 1)
    expect(history.past.map((e) => e.state)).toEqual([0, 1])
  })

  it('forceNewEntry starts a new step even within the coalesce window (multiboard support: two rapid edits attributed to different boards must never merge)', () => {
    let history = createHistoryState(0)
    history = pushUpdate(history, 1, T0)
    history = pushUpdate(history, 2, T0 + 100, undefined, true)
    expect(history.past.map((e) => e.state)).toEqual([0, 1])
    expect(history.present.state).toBe(2)
  })

  it('drops a no-op update (same reference) without recording a step', () => {
    const value = { x: 1 }
    let history = createHistoryState(value)
    history = pushUpdate(history, value, T0)
    expect(history.past).toEqual([])
    expect(history.present.state).toBe(value)
  })

  it('caps history depth at MAX_HISTORY', () => {
    let history = createHistoryState(0)
    let now = T0
    const overflow = 5
    for (let i = 1; i <= MAX_HISTORY + overflow; i++) {
      now += COALESCE_MS + 1
      history = pushUpdate(history, i, now)
    }
    expect(history.past.length).toBe(MAX_HISTORY)
    expect(history.past[0]?.state).toBe(overflow)
  })
})

describe('undo/redo', () => {
  it('moves the present step back into future and restores the prior present', () => {
    let history = createHistoryState(0)
    history = pushUpdate(history, 1, T0)
    history = pushUpdate(history, 2, T0 + COALESCE_MS + 1)

    const result = undo(history)
    expect(result.history.present.state).toBe(1)
    expect(result.history.future.map((e) => e.state)).toEqual([2])

    const redone = redo(result.history)
    expect(redone.present.state).toBe(2)
    expect(redone.future).toEqual([])
  })

  it('is a no-op at the start/end of history', () => {
    const history = createHistoryState(0)
    expect(undo(history).history).toEqual(history)
    expect(redo(history)).toEqual(history)
  })

  it('surfaces restoreSelection from the entry being undone (spec §8/Q11)', () => {
    let history = createHistoryState<string[]>([])
    history = pushUpdate(history, ['a', 'b'], T0)
    history = pushUpdate(history, [], T0 + COALESCE_MS + 1, ['a', 'b'])

    const result = undo(history)
    expect(result.history.present.state).toEqual(['a', 'b'])
    expect(result.restoreSelection).toEqual(['a', 'b'])
  })
})
