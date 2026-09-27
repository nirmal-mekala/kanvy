# Link metadata: drop microlink.io, scrape raw HTML instead

Spec §5.4/§10 describe link-card title/preview-image fetching as proxied
through microlink.io's free public API. That free tier caps out at roughly
25 requests/day, which made it unsustainable for real usage — so
`src/cards/linkMetadata.ts` no longer calls microlink at all.

## New behavior

`fetchLinkMetadata` now does a raw `fetch(url)` of the pasted/typed URL
itself, reads the response as text, and scrapes metadata out of it with
`DOMParser`:

- **title**: `og:title` → `twitter:title` → `<title>` → `null`
- **image**: `og:image` → `twitter:image` → `og:image:url` → `null`

The `LinkMetadata` return shape (`{ title, imageUrl }`), the timeout
(6s)/retry (3 attempts, linear backoff) behavior, and the injectable
`fetchImpl` test seam are all unchanged from the microlink implementation —
only how the HTTP response is obtained and interpreted changed.

## Known limitation: CORS

Fetching an arbitrary third-party URL directly from the browser only
succeeds if that site sends `Access-Control-Allow-Origin` permitting our
origin. Most real-world sites don't, so for a large fraction of pasted
links this will fail outright (opaque `TypeError: Failed to fetch`,
indistinguishable from a network error) and the link card falls through to
its existing `status: 'error'` state — same as any other unreachable URL.
This was an explicit, accepted tradeoff of removing the proxy rather than
standing up a server-side one: no backend fetch is involved.

## What did not change

- Both call sites (`src/components/canvas/useCardCreation.ts`,
  `src/components/canvas/useCardEditing.ts`) and the orchestration wrapper
  (`src/cards/applyLinkMetadata.ts`) are untouched — the
  `fetchLinkMetadata(url, fetchImpl?) -> Promise<LinkMetadata>` contract
  didn't change shape.
- `LinkCardSchema` (`src/schema/node.ts`) is untouched — no
  description/favicon field was added, since none was previously stored.
- e2e mocking (`e2e/fixtures/linkMetadata.ts`) still intercepts the
  request and fulfills it — it now routes the target URL itself (the specs
  all pasted/typed `https://example.com`) and returns a small HTML
  fixture with `og:*` meta tags instead of a microlink-shaped JSON body.
