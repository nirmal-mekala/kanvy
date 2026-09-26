// The generic REST boundary network mode talks to (json-server for now,
// network mode design doc §1/§5/§6a) — kept generic enough (plain
// collection-name + id REST calls, a bearer auth header) that a different
// backend could eventually sit behind the same client, per the design
// doc's explicit ask.

import type { NetworkConfig } from '../state/atoms/networkSettings'
import { fetchAllPages } from './fetchAllPages'

function collectionUrl(config: NetworkConfig, path: string): URL {
  return new URL(
    path,
    config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`,
  )
}

/** `Authorization: Bearer <token>` when a token is set, no header at all when blank (design doc §2). */
function authHeaders(config: NetworkConfig): HeadersInit {
  return config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}
}

function jsonHeaders(config: NetworkConfig): HeadersInit {
  return { ...authHeaders(config), 'Content-Type': 'application/json' }
}

async function throwIfNotOk(response: Response, label: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status})`)
  }
}

/**
 * The settings modal's Confirm connection test (design doc §2/§10) — a
 * cheap, real request against the configured base URL using the same auth
 * header network mode's other requests will use. `GET /boards?_page=1&
 * _per_page=1`, per the developer's own call on the open question.
 */
export async function testConnection(
  config: NetworkConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = collectionUrl(config, 'boards')
  url.searchParams.set('_page', '1')
  url.searchParams.set('_per_page', '1')
  const response = await fetchImpl(url.toString(), {
    headers: authHeaders(config),
  })
  await throwIfNotOk(response, 'Connection test')
}

/** Fetches every entry of `collection` (paginated in full, design doc §6a), optionally narrowed by a server-side query param (e.g. `{ boardId: 'root' }`). */
export async function fetchCollection<T>(
  config: NetworkConfig,
  collection: string,
  query?: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<T[]> {
  const url = collectionUrl(config, collection)
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value)
  }
  return fetchAllPages<T>(
    url.toString(),
    { headers: authHeaders(config) },
    fetchImpl,
  )
}

/**
 * Creates an entity and returns the server's own record of it — callers
 * must read the returned `id` rather than assume the one they sent was
 * honored (json-server, and REST backends generally, are free to assign
 * their own; network mode's write path (api/networkOps.ts) treats
 * whatever comes back here as that entity's canonical id from then on —
 * see api/networkIdRemap.ts).
 */
export async function createEntity<T, R = T>(
  config: NetworkConfig,
  collection: string,
  value: T,
  fetchImpl: typeof fetch = fetch,
): Promise<R> {
  const response = await fetchImpl(
    collectionUrl(config, collection).toString(),
    {
      method: 'POST',
      headers: jsonHeaders(config),
      body: JSON.stringify(value),
    },
  )
  await throwIfNotOk(response, `POST /${collection}`)
  return response.json() as Promise<R>
}

export async function patchEntity(
  config: NetworkConfig,
  collection: string,
  id: string,
  patch: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    collectionUrl(config, `${collection}/${id}`).toString(),
    {
      method: 'PATCH',
      headers: jsonHeaders(config),
      body: JSON.stringify(patch),
    },
  )
  await throwIfNotOk(response, `PATCH /${collection}/${id}`)
}

export async function deleteEntity(
  config: NetworkConfig,
  collection: string,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    collectionUrl(config, `${collection}/${id}`).toString(),
    { method: 'DELETE', headers: authHeaders(config) },
  )
  await throwIfNotOk(response, `DELETE /${collection}/${id}`)
}
