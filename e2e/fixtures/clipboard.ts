import type { Page } from '@playwright/test'

export interface PastePayload {
  text?: string
  /** A data URI (e.g. `data:image/png;base64,...`) representing an image on the clipboard. */
  imageDataUri?: string
}

/**
 * Dispatches a synthetic `paste` event carrying fake `clipboardData` —
 * clipboard/paste APIs are mocked in tests, never driven through real
 * browser permission grants (spec §7/§13).
 */
export async function dispatchPaste(
  page: Page,
  payload: PastePayload,
  targetSelector?: string,
): Promise<void> {
  await page.evaluate(
    async ({ payload, targetSelector }) => {
      const dataTransfer = new DataTransfer()
      if (payload.text !== undefined) {
        dataTransfer.setData('text/plain', payload.text)
      }
      if (payload.imageDataUri !== undefined) {
        const response = await fetch(payload.imageDataUri)
        const blob = await response.blob()
        const file = new File([blob], 'pasted-image.png', {
          type: blob.type || 'image/png',
        })
        dataTransfer.items.add(file)
      }
      const target = targetSelector
        ? document.querySelector(targetSelector)
        : document.body
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      })
      ;(target ?? document).dispatchEvent(event)
    },
    { payload, targetSelector },
  )
}
