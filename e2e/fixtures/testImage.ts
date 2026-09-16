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
