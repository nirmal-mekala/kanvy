import { describe, expect, it } from 'vitest'
import type { CardNode } from '../../schema/node'
import { cardClassNames } from './cardClassNames'

const baseOpts = {
  headingSize: null,
  isDone: false,
  isDimmed: false,
  selected: false,
  dragging: false,
}

const textNode: CardNode = {
  id: 'n1',
  boardId: 'root',
  type: 'card',
  kind: 'text',
  size: 'regular',
  x: 0,
  y: 0,
  w: 224,
  h: 90,
  color: 'gray',
  content: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const imageNode: CardNode = {
  ...textNode,
  kind: 'image',
  imageId: 'img1',
}

describe('cardClassNames', () => {
  it('always includes the base class', () => {
    expect(cardClassNames(textNode, baseOpts)).toBe('card')
  })

  it('adds card--h1/h2/h3 for the matching heading size', () => {
    for (const size of ['h1', 'h2', 'h3'] as const) {
      expect(
        cardClassNames(textNode, { ...baseOpts, headingSize: size }),
      ).toContain(`card--${size}`)
    }
  })

  it('adds no heading class for regular size or no heading size at all', () => {
    expect(
      cardClassNames(textNode, { ...baseOpts, headingSize: 'regular' }),
    ).toBe('card')
    expect(cardClassNames(textNode, { ...baseOpts, headingSize: null })).toBe(
      'card',
    )
  })

  it('adds card--image for an image card', () => {
    expect(cardClassNames(imageNode, baseOpts)).toContain('card--image')
  })

  it('adds card--link for a link card', () => {
    const linkNode: CardNode = {
      ...textNode,
      kind: 'link',
      link: { url: 'https://example.com', status: 'ready' },
    }
    expect(cardClassNames(linkNode, baseOpts)).toContain('card--link')
  })

  it('combines done, dimmed, and selected modifiers', () => {
    const classes = cardClassNames(textNode, {
      ...baseOpts,
      isDone: true,
      isDimmed: true,
      selected: true,
    })
    expect(classes).toBe('card card--done card--dimmed card--selected')
  })

  it('adds card--dragging while the card is being dragged', () => {
    expect(cardClassNames(textNode, { ...baseOpts, dragging: true })).toContain(
      'card--dragging',
    )
  })
})
