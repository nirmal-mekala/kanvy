import { describe, expect, it } from 'vitest'
import { resolveNodeAccent } from './borderColor'

const now = new Date('2026-09-30T12:00:00.000Z')
const node = {
  color: 'violet' as const,
  task: 'none' as const,
  updatedAt: '2026-09-30T11:00:00.000Z',
}

describe('resolveNodeAccent', () => {
  it("uses the node's own color in standard mode", () => {
    expect(resolveNodeAccent(node, 'standard', now)).toBe('violet')
  })

  it("uses a task's status in task mode", () => {
    expect(resolveNodeAccent({ ...node, task: 'blocked' }, 'task', now)).toBe(
      'task-blocked',
    )
  })

  it("goes neutral gray for a non-task (task 'none') in task mode", () => {
    expect(resolveNodeAccent(node, 'task', now)).toBe('gray')
  })

  it('derives from updatedAt in recency mode, ignoring task status', () => {
    expect(
      resolveNodeAccent(
        {
          ...node,
          task: 'done',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        'recency',
        now,
      ),
    ).toBe('coral')
  })
})
