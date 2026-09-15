import type { Page } from '@playwright/test'

export interface LinkMetadataStub {
  status: 'ready' | 'error' | 'timeout'
  title?: string
  imageUrl?: string
  /** Delay before responding — exercises the timeout/retry path added per spec §5.4 Q18. */
  delayMs?: number
}

/**
 * Intercepts every microlink.io request the app makes and responds per
 * `stub` — link metadata is always mocked in tests, never a live network
 * dependency (spec §13).
 */
export async function mockLinkMetadata(
  page: Page,
  stub: LinkMetadataStub,
): Promise<void> {
  await page.route('https://api.microlink.io/**', async (route) => {
    if (stub.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, stub.delayMs))
    }
    if (stub.status === 'timeout') {
      await route.abort('timedout')
      return
    }
    if (stub.status === 'error') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        data: {
          title: stub.title ?? null,
          image: stub.imageUrl !== undefined ? { url: stub.imageUrl } : null,
        },
      }),
    })
  })
}
