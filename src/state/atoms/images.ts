// Board-level image blob map (spec §2.6).

import { atom } from 'jotai'
import { boardAtom } from '../history/boardHistoryAtom'

/** The board's image blob map, keyed by generated id (spec §2.6). */
export const imagesAtom = atom((get) => get(boardAtom).images)

// `pruneOrphanedImages` itself lives in state/pruneOrphanedImages.ts (a
// pure function, no jotai dependency) so state/reaper.ts can use it
// without a circular import back through this file's own `boardAtom`
// dependency — re-exported here since every existing caller imports it
// from this module.
export { pruneOrphanedImages } from '../pruneOrphanedImages'
