import { describe, expect, it } from 'vitest'
import {
  dataTransferHasFiles,
  getImageFileFromClipboard,
  getImageFilesFromDataTransfer,
} from './imageFile'

function fakeFile(name: string, type: string): File {
  return new File(['x'], name, { type })
}

describe('getImageFileFromClipboard', () => {
  it('returns null when there is no clipboard data', () => {
    expect(getImageFileFromClipboard(null)).toBeNull()
  })

  it('returns the first image file item', () => {
    const file = fakeFile('a.png', 'image/png')
    const clipboardData = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => file },
      ],
    } as unknown as DataTransfer
    expect(getImageFileFromClipboard(clipboardData)).toBe(file)
  })

  it('returns null when there is no image item', () => {
    const clipboardData = {
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    } as unknown as DataTransfer
    expect(getImageFileFromClipboard(clipboardData)).toBeNull()
  })
})

describe('getImageFilesFromDataTransfer', () => {
  it('filters to only image files', () => {
    const imageFile = fakeFile('a.png', 'image/png')
    const textFile = fakeFile('a.txt', 'text/plain')
    const dataTransfer = {
      files: [imageFile, textFile],
    } as unknown as DataTransfer
    expect(getImageFilesFromDataTransfer(dataTransfer)).toEqual([imageFile])
  })

  it('returns an empty array when there are no files', () => {
    expect(getImageFilesFromDataTransfer(null)).toEqual([])
  })
})

describe('dataTransferHasFiles', () => {
  it('is true when types includes Files', () => {
    const dataTransfer = { types: ['Files'] } as unknown as DataTransfer
    expect(dataTransferHasFiles(dataTransfer)).toBe(true)
  })

  it('is false otherwise', () => {
    const dataTransfer = { types: ['text/plain'] } as unknown as DataTransfer
    expect(dataTransferHasFiles(dataTransfer)).toBe(false)
    expect(dataTransferHasFiles(null)).toBe(false)
  })
})
