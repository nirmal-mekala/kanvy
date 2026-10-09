// The title row on a link card (spec §5.4). Extracted out of Card.tsx to
// keep that component's cognitive complexity under Biome's threshold. The
// navigable `<a>` wraps this along with the preview image in CardBody, so
// this component itself is just the title text. "Loading…" reflects the
// in-memory fetch state (state/atoms/linkFetch.ts), not a stored field —
// schema v7, ctx/notes/261008-flat-link-fields.md.

import { useAtomValue } from 'jotai'
import type { LinkCard } from '../../schema/node'
import {
  isLinkFetchPending,
  pendingLinkFetchIdsAtom,
} from '../../state/atoms/linkFetch'

export function CardLinkMeta({ node }: { node: LinkCard }) {
  const pending = isLinkFetchPending(
    useAtomValue(pendingLinkFetchIdsAtom),
    node.id,
  )
  return (
    <div className="card__link-meta">
      <span className="card__link-title-text">
        {pending ? 'Loading…' : node.linkTitle || node.linkUrl}
      </span>
    </div>
  )
}
