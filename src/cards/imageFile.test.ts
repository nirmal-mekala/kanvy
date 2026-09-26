import { describe, expect, it } from 'vitest'
import {
  dataTransferHasFiles,
  estimateBase64Bytes,
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

describe('estimateBase64Bytes', () => {
  it('matches the known decoded byte length of a real base64 string', () => {
    // 'aGVsbG8sIHdvcmxkIQ==' is base64 for 'hello, world!' (13 bytes).
    expect(
      estimateBase64Bytes('data:text/plain;base64,aGVsbG8sIHdvcmxkIQ=='),
    ).toBe(13)
  })

  it('accounts for single-character padding', () => {
    // 'aGVsbG8=' is base64 for 'hello' (5 bytes).
    expect(estimateBase64Bytes('data:text/plain;base64,aGVsbG8=')).toBe(5)
  })

  it('handles no padding at all', () => {
    // 'aGVsbG8h' is base64 for 'hello!' (6 bytes, a multiple of 3).
    expect(estimateBase64Bytes('data:text/plain;base64,aGVsbG8h')).toBe(6)
  })

  it('scales roughly linearly for a large payload', () => {
    const base64 = 'A'.repeat(4000) // 4000 base64 chars -> 3000 decoded bytes
    expect(estimateBase64Bytes(`data:image/png;base64,${base64}`)).toBe(3000)
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
