// The title row on a link card (spec §5.4). Extracted out of Card.tsx to
// keep that component's cognitive complexity under Biome's threshold. The
// navigable `<a>` wraps this along with the preview image in CardBody, so
// this component itself is just the title text.

import type { LinkCard } from '../../schema/node'

export function CardLinkMeta({ link }: { link: LinkCard['link'] }) {
  return (
    <div className="card__link-meta">
      <span className="card__link-title-text">
        {link.status === 'loading' ? 'Loading…' : link.title || link.url}
      </span>
    </div>
  )
}
