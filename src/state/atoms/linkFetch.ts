// In-memory link-card metadata fetch state (spec §5.4; schema v7,
// ctx/notes/261008-flat-link-fields.md). Whether a card's metadata fetch is
// still in flight is app state, not data — it was v6's persisted
// `link.status`, which could get stuck at `'loading'` forever if the app
// reloaded mid-fetch. Here it lives only as long as the fetch itself; a
// reload simply drops it and the card shows its URL (or whatever metadata
// already landed).

import { atom } from 'jotai'
import { fetchLinkMetadata } from '../../cards/linkMetadata'
import type { NodeId } from '../../schema/node'
import { resolveReconciledNodeId } from '../networkReconcile'
import { updateLinkAtom } from './nodes'

/**
 * Ids of link cards whose metadata fetch is in flight, as captured when the
 * fetch started. Read through `isLinkFetchPending`, never directly — in
 * Network mode a captured id can since have been reconciled to a
 * server-assigned one.
 */
export const pendingLinkFetchIdsAtom = atom<ReadonlySet<NodeId>>(
  new Set<NodeId>(),
)

/** True while `nodeId`'s metadata fetch is in flight, following any network id reconciliation since it started. */
export function isLinkFetchPending(
  pendingIds: ReadonlySet<NodeId>,
  nodeId: NodeId,
): boolean {
  for (const id of pendingIds) {
    if (resolveReconciledNodeId(id) === nodeId) return true
  }
  return false
}

/**
 * Fire-and-forget metadata fetch + apply for a just-created/converted link
 * card — shared by slurp conversion (useCardEditing.ts) and paste-created
 * link cards (useCardCreation.ts). Marks the card pending, applies the
 * result via `updateLinkAtom` on success, and clears pending either way. A
 * failed fetch leaves the card's `linkTitle`/`linkImageUrl` as they were
 * (`null` for a fresh card), so it shows its URL.
 */
export const fetchLinkMetadataAtom = atom(
  null,
  (get, set, id: NodeId, url: string) => {
    set(pendingLinkFetchIdsAtom, new Set([...get(pendingLinkFetchIdsAtom), id]))
    const settle = () => {
      const next = new Set(get(pendingLinkFetchIdsAtom))
      next.delete(id)
      set(pendingLinkFetchIdsAtom, next)
    }
    fetchLinkMetadata(url).then((metadata) => {
      set(updateLinkAtom, id, {
        linkTitle: metadata.title,
        linkImageUrl: metadata.imageUrl,
      })
      settle()
    }, settle)
  },
)
