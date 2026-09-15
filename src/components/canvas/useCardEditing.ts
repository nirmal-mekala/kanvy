// Caption editing + URL-slurp orchestration (spec §5.4) — wires the pure
// `detectSlurpOnType`/`detectSlurpOnBlur` (src/cards/urlSlurp.ts, built in
// Stage 3) and `convertToLinkCard` (Stage 6) into the actual textarea
// onChange/onBlur handlers. Only `kind: 'text'` cards ever slurp (spec
// §5.3: an image card's caption never triggers it).

import { useSetAtom } from 'jotai'
import { applyLinkMetadata } from '../../cards/applyLinkMetadata'
import { convertToLinkCard } from '../../cards/convertCardKind'
import { detectSlurpOnBlur, detectSlurpOnType } from '../../cards/urlSlurp'
import type { Node, NodeId } from '../../schema/node'
import {
  replaceNodeAtom,
  updateCardContentAtom,
  updateLinkAtom,
} from '../../state/atoms/nodes'

export function useCardEditing({
  nodesById,
}: {
  nodesById: ReadonlyMap<NodeId, Node>
}) {
  const updateCardContent = useSetAtom(updateCardContentAtom)
  const replaceNode = useSetAtom(replaceNodeAtom)
  const updateLink = useSetAtom(updateLinkAtom)

  // CRAP scoring penalizes these handlers for 0% coverage —
  // component/interaction tests aren't a required tier for v0 (spec §13);
  // real coverage comes from e2e (e2e/*.spec.ts), which fallow's static
  // analysis can't see. Same precedent as useBoardInteraction.ts (Stage 5).
  // fallow-ignore-next-line complexity
  function handleContentChange(id: NodeId, content: string) {
    const node = nodesById.get(id)
    if (!node || node.type !== 'card') return
    updateCardContent(id, content)

    if (node.kind !== 'text') return
    // The textarea's onChange fires after the keystroke lands, so the just-
    // typed trigger character is the content's last character — matches
    // detectSlurpOnType's "at cursor position" contract for the live-typing
    // case (spec §5.4a) without needing the DOM selection API.
    const slurp = detectSlurpOnType(content, content.length)
    if (!slurp) return
    updateCardContent(id, slurp.remainingText)
    replaceNode(
      id,
      convertToLinkCard({ ...node, content: slurp.remainingText }, slurp.url),
    )
    applyLinkMetadata(id, slurp.url, updateLink)
  }

  // fallow-ignore-next-line complexity
  function handleContentBlur(id: NodeId) {
    const node = nodesById.get(id)
    if (!node || node.type !== 'card' || node.kind !== 'text') return
    const slurp = detectSlurpOnBlur(node.content)
    if (!slurp) return
    replaceNode(
      id,
      convertToLinkCard({ ...node, content: slurp.remainingText }, slurp.url),
    )
    applyLinkMetadata(id, slurp.url, updateLink)
  }

  return { handleContentChange, handleContentBlur }
}
