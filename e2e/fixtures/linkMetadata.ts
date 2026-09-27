import type { Page } from '@playwright/test'

export interface LinkMetadataStub {
  status: 'ready' | 'error' | 'timeout'
  title?: string
  imageUrl?: string
  /** Delay before responding — exercises the timeout/retry path added per spec §5.4 Q18. */
  delayMs?: number
  /** URL the app will request metadata for; defaults to the `https://example.com` these specs paste/type. */
  url?: string
}

function stubBody(stub: LinkMetadataStub): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (stub.title !== undefined) body.title = stub.title
  if (stub.imageUrl !== undefined) body.images = [stub.imageUrl]
  return body
}

/**
 * Intercepts the app's call to the metadata.party extraction proxy and
 * responds per `stub` — link metadata is always mocked in tests, never a
 * live network dependency (spec §13). Since v0.3 the app proxies through
 * `https://api.metadata.party/extract` (POST `{ url }`) instead of fetching
 * the target URL directly, so this routes that fixed proxy endpoint and
 * asserts on the requested `url` in the JSON body.
 */
export async function mockLinkMetadata(
  page: Page,
  stub: LinkMetadataStub,
): Promise<void> {
  const targetUrl = stub.url ?? 'https://example.com'
  await page.route('https://api.metadata.party/extract', async (route) => {
    const requestBody = route.request().postDataJSON() as { url?: string }
    if (requestBody.url !== targetUrl) {
      await route.continue()
      return
    }
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
        body: JSON.stringify({ error: 'failed to fetch URL' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stubBody(stub)),
    })
  })
}
