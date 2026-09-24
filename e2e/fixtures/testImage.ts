import type { Page } from '@playwright/test'

/**
 * Renders a solid-color `width`x`height` PNG entirely in-page (via
 * `<canvas>.toDataURL`) and returns its data URI — a real, decodable image
 * of an arbitrary size without fetching anything over the network, so
 * specs can exercise the downsizing pipeline (`cards/imageFile.ts`'s
 * `MAX_IMAGE_DIMENSION` threshold) with an image actually larger than it.
 */
export async function makeImageDataUri(
  page: Page,
  width: number,
  height: number,
): Promise<string> {
  return page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')
      ctx.fillStyle = '#4c566a'
      ctx.fillRect(0, 0, width, height)
      return canvas.toDataURL('image/png')
    },
    { width, height },
  )
}

/**
 * Like `makeImageDataUri`, but fills the canvas with random per-pixel
 * noise instead of a solid color — a solid-color PNG compresses to almost
 * nothing regardless of pixel dimensions, which can't exercise a
 * byte-size-based limit (network mode design doc's json-server ~100KB
 * body cap, `cards/imageFile.ts`'s `ensureDataUriUnderBytes`). Noise is
 * effectively incompressible, so this reliably produces a data URI whose
 * encoded size actually scales with `width`/`height`.
 */
export async function makeNoisyImageDataUri(
  page: Page,
  width: number,
  height: number,
): Promise<string> {
  return page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')
      const imageData = ctx.createImageData(width, height)
      // `crypto.getRandomValues` refuses more than 65536 bytes per call —
      // fill in chunks rather than handing it the whole (likely much
      // larger) pixel buffer at once.
      const CRYPTO_MAX_BYTES = 65536
      for (
        let offset = 0;
        offset < imageData.data.length;
        offset += CRYPTO_MAX_BYTES
      ) {
        crypto.getRandomValues(
          imageData.data.subarray(offset, offset + CRYPTO_MAX_BYTES),
        )
      }
      // Fully opaque — random alpha would make most pixels near-transparent.
      for (let i = 3; i < imageData.data.length; i += 4) {
        imageData.data[i] = 255
      }
      ctx.putImageData(imageData, 0, 0)
      return canvas.toDataURL('image/png')
    },
    { width, height },
  )
}
