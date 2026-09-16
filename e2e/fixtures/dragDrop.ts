import type { Page } from '@playwright/test'

/**
 * Dispatches a synthetic `dragover` + `drop` sequence carrying a fake
 * `dataTransfer` with a single image file — file-drop is mocked the same
 * way `dispatchPaste` (fixtures/clipboard.ts) mocks clipboard data, never
 * driven through real OS drag gestures (spec §7/§13's "mocked, not real
 * browser permission grants" precedent applies equally here).
 */
export async function dispatchImageFileDrop(
  page: Page,
  dataUri: string,
  clientX: number,
  clientY: number,
  targetSelector = '[data-testid="canvas-root"]',
): Promise<void> {
  await page.evaluate(
    async ({ dataUri, clientX, clientY, targetSelector }) => {
      const response = await fetch(dataUri)
      const blob = await response.blob()
      const file = new File([blob], 'dropped-image.png', {
        type: blob.type || 'image/png',
      })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)

      const target = document.querySelector(targetSelector)
      if (!target) throw new Error(`drop target not found: ${targetSelector}`)

      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            dataTransfer,
          }),
        )
      }
    },
    { dataUri, clientX, clientY, targetSelector },
  )
}
