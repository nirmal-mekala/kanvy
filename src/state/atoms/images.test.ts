import { describe, expect, it } from 'vitest'
import type { Node } from '../../schema/node'
import { pruneOrphanedImages } from './images'

function imageNode(id: string, imageId: string): Node {
  return {
    id,
    boardId: 'root',
    type: 'card',
    kind: 'image',
    imageId,
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    status: 'active',
    index: 0,
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('pruneOrphanedImages', () => {
  it('drops images no node references', () => {
    const images = { img1: 'a', img2: 'b' }
    const result = pruneOrphanedImages([imageNode('n1', 'img1')], images)
    expect(result).toEqual({ img1: 'a' })
  })

  it('returns the same reference when nothing is orphaned', () => {
    const images = { img1: 'a' }
    const result = pruneOrphanedImages([imageNode('n1', 'img1')], images)
    expect(result).toBe(images)
  })

  it('keeps every image when nothing is orphaned even with multiple nodes', () => {
    const images = { img1: 'a', img2: 'b' }
    const nodes = [imageNode('n1', 'img1'), imageNode('n2', 'img2')]
    expect(pruneOrphanedImages(nodes, images)).toBe(images)
  })
})
