// Fire-and-forget metadata fetch + apply for a just-created/converted link
// card (spec §5.4) — shared by useCardEditing.ts (slurp conversion) and
// useCardCreation.ts (paste-created link cards) so both go through the same
// loading→ready/error flow instead of duplicating the `.then` wiring.

import type { LinkCard } from '../schema/node'
import { fetchLinkMetadata } from './linkMetadata'

export function applyLinkMetadata(
  id: string,
  url: string,
  updateLink: (id: string, patch: Partial<LinkCard['link']>) => void,
): void {
  fetchLinkMetadata(url).then(
    (metadata) => {
      updateLink(id, {
        status: 'ready',
        ...(metadata.title !== null ? { title: metadata.title } : {}),
        ...(metadata.imageUrl !== null ? { imageUrl: metadata.imageUrl } : {}),
      })
    },
    () => {
      updateLink(id, { status: 'error' })
    },
  )
}
