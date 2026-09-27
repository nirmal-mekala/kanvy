# Link metadata: proxy through metadata.party instead of raw fetch

`ctx/notes/260926-raw-fetch-link-metadata.md` describes dropping
microlink.io in favor of a raw same-origin `fetch(url)` of the
pasted/typed URL, scraped with regex for `og:*`/`twitter:*` tags. That
approach's accepted-tradeoff CORS failure turned out to break metadata
fetching for most real-world links (few third-party sites send
`Access-Control-Allow-Origin` back to an arbitrary origin), so
`src/cards/linkMetadata.ts` now proxies the request through
[metadata.party](https://metadata.party/) instead.

## New behavior

`fetchLinkMetadata` now does `POST https://api.metadata.party/extract`
with a JSON body `{ url }`, instead of fetching `url` itself. The API is
a CORS-enabled Go service that fetches the target URL server-side, parses
its `og:*`/`twitter:*`/`<title>` tags, and returns JSON:

```json
{
  "title": "...",
  "description": "...",
  "images": ["..."],
  "sitename": ["..."],
  "favicon": "...",
  "duration": 123,
  "domain": "example.com",
  "url": "https://example.com"
}
```

`fetchLinkMetadata` maps this to the existing `LinkMetadata` shape:
- **title**: `data.title` → `null`
- **imageUrl**: `data.images[0]` → `null`

A non-`ok` HTTP status or an `error` field in the body (e.g. rate-limit
responses, or metadata.party's own upstream-fetch failures) is treated as
a failure and goes through the existing retry path.

The `LinkMetadata` return shape (`{ title, imageUrl }`), the timeout
(6s)/retry (3 attempts, linear backoff) behavior, and the injectable
`fetchImpl` test seam are all unchanged — only how the HTTP request is
made and the response is interpreted changed.

## Rate limiting

metadata.party's public instance rate-limits to 15 req/min per IP without
an API key. No API key is configured (no `API_KEY`/settings-modal field
was added) — this is the same class of tradeoff as microlink's cap, just
a higher ceiling, and revisiting it (e.g. adding a key via env var) is
out of scope here unless it becomes a problem in practice.

## What did not change

- Both call sites (`src/components/canvas/useCardCreation.ts`,
  `src/components/canvas/useCardEditing.ts`) and the orchestration wrapper
  (`src/cards/applyLinkMetadata.ts`) are untouched — the
  `fetchLinkMetadata(url, fetchImpl?) -> Promise<LinkMetadata>` contract
  didn't change shape.
- `LinkCardSchema` (`src/schema/node.ts`) is untouched — no
  description/favicon field was added, since none was previously stored.
- e2e mocking (`e2e/fixtures/linkMetadata.ts`) still intercepts a single
  fixed request and fulfills it — it now routes
  `https://api.metadata.party/extract` (asserting the requested `url` in
  the POST body matches the stub's target) and returns a small JSON
  fixture shaped like metadata.party's response instead of an HTML page.
