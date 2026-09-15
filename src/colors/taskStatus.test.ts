import { describe, expect, it } from 'vitest'
import { resolveTaskStatusColor, type TaskStatus } from './taskStatus'

describe('resolveTaskStatusColor', () => {
  it('resolves todo to a distinct hex per theme', () => {
    expect(resolveTaskStatusColor('todo', 'light')).not.toBe(
      resolveTaskStatusColor('todo', 'dark'),
    )
  })

  it.each<TaskStatus>(['blocked', 'in_progress', 'done'])(
    'resolves %s to the same hex in both themes',
    (status) => {
      expect(resolveTaskStatusColor(status, 'light')).toBe(
        resolveTaskStatusColor(status, 'dark'),
      )
    },
  )

  it('gives every status a distinct color (within a theme)', () => {
    const statuses: TaskStatus[] = ['todo', 'blocked', 'in_progress', 'done']
    const colors = statuses.map((status) =>
      resolveTaskStatusColor(status, 'light'),
    )
    expect(new Set(colors).size).toBe(statuses.length)
  })
})
