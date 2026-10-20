import { describe, expect, it } from 'vitest'
import { camelToSnake, createFieldMapping, snakeToCamel } from './fieldMapping'

describe('camelToSnake / snakeToCamel', () => {
  it.each([
    ['id', 'id'],
    ['isRoot', 'is_root'],
    ['linkImageUrl', 'link_image_url'],
    ['fromNodeId', 'from_node_id'],
  ])('%s ↔ %s', (camel, snake) => {
    expect(camelToSnake(camel)).toBe(snake)
    expect(snakeToCamel(snake)).toBe(camel)
  })
})

describe('createFieldMapping', () => {
  it('maps row keys both ways and leaves values alone', () => {
    const fields = createFieldMapping('snake')
    const wire = fields.toWireRow('nodes', {
      boardId: 'b',
      task: 'in_progress',
      linkTitle: null,
    })
    expect(wire).toEqual({
      board_id: 'b',
      task: 'in_progress',
      link_title: null,
    })
    expect(fields.fromWireRow('nodes', wire)).toEqual({
      boardId: 'b',
      task: 'in_progress',
      linkTitle: null,
    })
  })

  it('lets a per-collection rename win over the casing rule, in both directions, for that collection only', () => {
    const fields = createFieldMapping('snake', {
      nodes: { position: 'item_pos' },
    })
    expect(fields.toWireField('nodes', 'position')).toBe('item_pos')
    expect(fields.fromWireField('nodes', 'item_pos')).toBe('position')
    expect(fields.toWireField('edges', 'position')).toBe('position')
    expect(fields.fromWireRow('nodes', { item_pos: 3, board_id: 'b' })).toEqual(
      { position: 3, boardId: 'b' },
    )
  })

  it("'identity' keeps this app's own names", () => {
    const fields = createFieldMapping('identity')
    expect(fields.toWireRow('boards', { isRoot: true })).toEqual({
      isRoot: true,
    })
  })
})
