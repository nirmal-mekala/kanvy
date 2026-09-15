import { describe, expect, it } from 'vitest'
import type { CardNode } from '../../schema/node'
import { cardClassNames } from './cardClassNames'

const baseOpts = {
  isBig: false,
  isDone: false,
  isDimmed: false,
  selected: false,
}

const textNode: CardNode = {
  id: 'n1',
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

  it('adds card--big when isBig', () => {
    expect(cardClassNames(textNode, { ...baseOpts, isBig: true })).toContain(
      'card--big',
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
})
