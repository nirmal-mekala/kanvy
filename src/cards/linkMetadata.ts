// Link-card title/preview-image fetch (spec §5.4). Previously proxied
// through microlink.io's free API (25 req/day cap made it unsustainable),
// then briefly did a raw same-origin-only `fetch` of the pasted URL itself
// (broke via CORS for most real sites). Now proxies through metadata.party
// (`POST https://api.metadata.party/extract`), a CORS-enabled extraction
// API — see https://metadata.party/. Timeout + retry (spec §5.4/Q18) are
// kept. `fetchImpl` is injectable so tests never hit the real network (spec
// §13) — production callers omit it and get the real `fetch`.

const METADATA_PARTY_ENDPOINT = 'https://api.metadata.party/extract'
const REQUEST_TIMEOUT_MS = 6000
const MAX_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 400

export interface LinkMetadata {
  title: string | null
  imageUrl: string | null
}

interface MetadataPartyResponse {
  title?: string
  images?: string[]
  error?: string
}

function toLinkMetadata(data: MetadataPartyResponse): LinkMetadata {
  return {
    title: data.title || null,
    imageUrl: data.images?.[0] || null,
  }
}

async function fetchOnce(
  url: string,
  fetchImpl: typeof fetch,
): Promise<LinkMetadata> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetchImpl(METADATA_PARTY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })
    const data = (await res.json()) as MetadataPartyResponse
    if (!res.ok || data.error) {
      throw new Error(
        data.error ?? `Link metadata request failed (${res.status})`,
      )
    }
    return toLinkMetadata(data)
  } finally {
    clearTimeout(timeout)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetches title/preview-image metadata for `url` via the metadata.party
 * extraction proxy, retrying up to `MAX_ATTEMPTS` times (short fixed
 * backoff) on failure or timeout before giving up (spec §5.4/Q18's v0
 * improvement over the prototype's permanent-failure behavior).
 */
export async function fetchLinkMetadata(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkMetadata> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(url, fetchImpl)
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS) await delay(RETRY_BACKOFF_MS * attempt)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Link metadata request failed')
}
