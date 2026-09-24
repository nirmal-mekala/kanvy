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
/** Re-encodes `img` through a canvas at `(outW, outH)`, or throws if a 2D context can't be obtained. `quality` only applies to `image/jpeg` (canvas ignores it for `image/png`, which has no lossy-quality concept). */
function downsizeThroughCanvas(
  img: CanvasImageSource,
  outW: number,
  outH: number,
  mimeType: string,
  quality = 0.9,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0, outW, outH)
  return canvas.toDataURL(
    mimeType,
    mimeType === 'image/jpeg' ? quality : undefined,
  )
}

/**
 * The byte size of the binary data a base64 data URI decodes to — used to
 * estimate the actual request-body size a `dataUri` would produce (network
 * mode design doc §5's images `POST`/`PATCH`; a REST backend's body-size
 * limit applies to the wire payload, not the pixel dimensions). Pure and
 * synchronous — no canvas/Image dependency — so it's directly unit-testable
 * (see imageFile.test.ts), unlike the re-encode pipeline below.
 */
export function estimateBase64Bytes(dataUri: string): number {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = src
  })
}

/**
 * Re-encodes `dataUri` at progressively smaller dimensions/quality until
 * its estimated byte size is at or under `maxBytes`, or gives up after a
 * bounded number of attempts and returns the smallest version reached
 * (still under `maxBytes` isn't guaranteed for a pathological image, but
 * every attempt strictly shrinks the payload). A no-op (returns `dataUri`
 * unchanged) when it's already under `maxBytes` — this never *upscales* or
 * re-encodes an image that already fits, even losslessly.
 *
 * Separate from `processImageFile`'s pixel-dimension cap (spec §2.6, always
 * applied at capture time regardless of mode): this exists for network
 * mode's own, independent constraint — json-server's (and REST backends'
 * generally) request-body size limit, which a 1200px-long-edge PNG can
 * still exceed for a busy/high-detail image. Called only from network
 * mode's write path (api/networkOps.ts) — local mode's stored `dataUri` is
 * never touched by this.
 */
export async function ensureDataUriUnderBytes(
  dataUri: string,
  maxBytes: number,
): Promise<string> {
  if (estimateBase64Bytes(dataUri) <= maxBytes) return dataUri

  const img = await loadImage(dataUri)
  const isJpeg = dataUri.startsWith('data:image/jpeg')
  const mime = isJpeg ? 'image/jpeg' : 'image/png'
  let current = dataUri
  let scale = 1

  // Each attempt shrinks the long edge by 25% (quartering the pixel count
  // every two attempts) and, for JPEG, also drops quality — both reduce
  // encoded size, so this always makes progress even against a single
  // solid-color PNG (fewer pixels still means fewer output bytes).
  for (let attempt = 0; attempt < 10; attempt++) {
    scale *= 0.75
    const outW = Math.max(1, Math.round(img.naturalWidth * scale))
    const outH = Math.max(1, Math.round(img.naturalHeight * scale))
    const quality = isJpeg ? Math.max(0.4, 0.9 - attempt * 0.05) : undefined
    current = downsizeThroughCanvas(img, outW, outH, mime, quality)
    if (estimateBase64Bytes(current) <= maxBytes) return current
  }
  return current
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
