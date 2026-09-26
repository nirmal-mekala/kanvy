// Board-level image blob map (spec §2.6).

import { atom } from 'jotai'
import { boardAtom } from '../history/boardHistoryAtom'

/** The board's image blob entries (spec §2.6; array-ified schema v5, ctx/notes/260923-network-mode-backend-integration-design.md §4). */
export const imagesAtom = atom((get) => get(boardAtom).images)

/** Looks up one image entry's `dataUri` by id — the array-shaped equivalent of the old `images[id]` record access. */
export function findImageDataUri(
  images: readonly { id: string; dataUri: string }[],
  id: string,
): string | undefined {
  return images.find((entry) => entry.id === id)?.dataUri
}

// `pruneOrphanedImages` itself lives in state/pruneOrphanedImages.ts (a
// pure function, no jotai dependency) so state/reaper.ts can use it
// without a circular import back through this file's own `boardAtom`
// dependency — re-exported here since every existing caller imports it
// from this module.
export { pruneOrphanedImages } from '../pruneOrphanedImages'
