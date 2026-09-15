// Which card should grab its caption's focus on next render — set by
// ⌘/Ctrl+N (new text card) and ⌘/Ctrl+D (duplicate, single-card case),
// per spec §4.2. Cleared once the card applies it.

import { atom } from 'jotai'
import type { NodeId } from '../../schema/node'

export const focusNodeIdAtom = atom<NodeId | null>(null)
