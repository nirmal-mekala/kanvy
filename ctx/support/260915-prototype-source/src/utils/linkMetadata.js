// microlink.io's free public API — no backend of our own to proxy through,
// and most sites block a direct cross-origin fetch of their own HTML, so
// this is what actually makes a title/preview-image possible at all. It
// means the pasted URL itself is sent to a third party.
const API_BASE = 'https://api.microlink.io/'

export async function fetchLinkMetadata(url) {
  const res = await fetch(`${API_BASE}?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`Link metadata request failed (${res.status})`)
  const json = await res.json()
  if (json.status !== 'success') throw new Error('Link metadata request failed')
  const { title, image, logo } = json.data ?? {}
  return {
    title: title || null,
    imageUrl: image?.url || logo?.url || null,
  }
}
