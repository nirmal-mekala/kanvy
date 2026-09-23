// Shared "fetch every page" helper for a json-server collection (network
// mode / backend integration design doc §6a) — every unbounded "fetch all"
// read in this app goes through this, rather than a single unbounded
// request, since json-server (and REST backends generally) may paginate a
// large collection whether or not the caller asked for it.

/** json-server v1's `_page`/`_per_page` pagination envelope (ctx/support/260923-json-server-docs.md). */
export interface PaginatedResponse<T> {
  first: number
  prev: number | null
  next: number | null
  last: number
  pages: number
  items: number
  data: T[]
}

/** Page size for each request in the loop — large enough that a typical board's collection fits in one or two pages, small enough to stay a reasonable single-request payload. */
const FETCH_ALL_PAGES_PER_PAGE = 200

/**
 * Fetches every page of `url` (a json-server collection endpoint, with any
 * of its own query params already applied — e.g. `?boardId=root`) and
 * concatenates their `data` arrays. Stops once the server reports no next
 * page, or a page comes back empty (defensive against a server that
 * doesn't paginate at all and just returns everything on page 1 — either
 * way, this doesn't loop past the point where there's nothing left).
 */
export async function fetchAllPages<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<T[]> {
  const results: T[] = []
  let page = 1
  for (;;) {
    const pageUrl = new URL(url)
    pageUrl.searchParams.set('_page', String(page))
    pageUrl.searchParams.set('_per_page', String(FETCH_ALL_PAGES_PER_PAGE))
    const response = await fetchImpl(pageUrl.toString(), init)
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}): ${pageUrl}`)
    }
    const body = (await response.json()) as PaginatedResponse<T>
    results.push(...body.data)
    if (body.next === null || body.data.length === 0) break
    page += 1
  }
  return results
}
