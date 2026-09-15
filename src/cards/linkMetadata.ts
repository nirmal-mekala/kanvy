// microlink.io title/preview-image fetch (spec §5.4) — ported from the
// prototype's utils/linkMetadata.js, with a timeout + basic retry added
// per spec §5.4/Q18 (today's prototype failure is permanent). Retry
// count/backoff are implementation details, not user-facing. `fetchImpl`
// is injectable so tests never hit the real network (spec §13) — production
// callers omit it and get the real `fetch`.

const API_BASE = 'https://api.microlink.io/'
const REQUEST_TIMEOUT_MS = 6000
const MAX_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 400

export interface LinkMetadata {
  title: string | null
  imageUrl: string | null
}

interface MicrolinkResponse {
  status?: string
  data?: {
    title?: string | null
    image?: { url?: string } | null
    logo?: { url?: string } | null
  }
}

async function fetchOnce(
  url: string,
  fetchImpl: typeof fetch,
): Promise<LinkMetadata> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetchImpl(`${API_BASE}?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Link metadata request failed (${res.status})`)
    const json = (await res.json()) as MicrolinkResponse
    if (json.status !== 'success')
      throw new Error('Link metadata request failed')
    const { title, image, logo } = json.data ?? {}
    return {
      title: title || null,
      imageUrl: image?.url || logo?.url || null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetches title/preview-image metadata for `url`, retrying up to
 * `MAX_ATTEMPTS` times (short fixed backoff) on failure or timeout before
 * giving up (spec §5.4/Q18's v0 improvement over the prototype's
 * permanent-failure behavior).
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
