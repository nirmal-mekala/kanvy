// Image file detection helpers (spec §5.3) — ported from the prototype's
// utils/image.js. `processImageFile`'s canvas re-encode pipeline itself
// needs real browser Image/canvas decoding (not meaningfully unit-testable
// under jsdom); these are the pure, DataTransfer/ClipboardData-shape-only
// helpers around it.

/** Long edge, in pixels, an image is downsized to before it's base64-encoded and stored (spec §2.6). */
const MAX_IMAGE_DIMENSION = 1200

export interface ProcessedImage {
  dataUri: string
  width: number
  height: number
}

/**
 * Reads `file`, downsizing it through a canvas if it's larger than
 * `MAX_IMAGE_DIMENSION` on its long edge. Resolves the (possibly
 * downsized) final pixel dimensions alongside the resulting data URI.
 */
/** Re-encodes `img` through a canvas at `(outW, outH)`, or throws if a 2D context can't be obtained. */
function downsizeThroughCanvas(
  img: HTMLImageElement,
  outW: number,
  outH: number,
  mimeType: string,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0, outW, outH)
  return canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.9 : undefined)
}

export function processImageFile(file: File): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image'))
      img.onload = () => {
        const { naturalWidth: width, naturalHeight: height } = img
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height))
        if (scale >= 1) {
          // Already small enough — keep the original bytes as-is rather
          // than re-encoding (and possibly losing quality) for no reason.
          resolve({ dataUri: reader.result as string, width, height })
          return
        }
        const outW = Math.max(1, Math.round(width * scale))
        const outH = Math.max(1, Math.round(height * scale))
        try {
          const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
          const dataUri = downsizeThroughCanvas(img, outW, outH, mime)
          resolve({ dataUri, width: outW, height: outH })
        } catch (error) {
          reject(error)
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** The first image file in a paste event's clipboard data, if any. */
export function getImageFileFromClipboard(
  clipboardData: DataTransfer | null | undefined,
): File | null {
  if (!clipboardData) return null
  for (const item of clipboardData.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}

/** Every image file in a drop event's dataTransfer. */
export function getImageFilesFromDataTransfer(
  dataTransfer: DataTransfer | null | undefined,
): File[] {
  if (!dataTransfer?.files) return []
  return [...dataTransfer.files].filter((file) =>
    file.type.startsWith('image/'),
  )
}

/** Whether a drag carries files at all — checkable during dragover (unlike file type/content, which isn't readable until drop), just enough to decide whether to preventDefault and allow the drop. */
export function dataTransferHasFiles(
  dataTransfer: DataTransfer | null | undefined,
): boolean {
  return (
    !!dataTransfer && Array.from(dataTransfer.types ?? []).includes('Files')
  )
}
