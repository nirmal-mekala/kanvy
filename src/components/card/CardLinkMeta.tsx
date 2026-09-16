// The clickable title row on a link card (spec §5.4) — the only part of a
// link card that actually navigates anywhere. Extracted out of Card.tsx to
// keep that component's cognitive complexity under Biome's threshold.

import { ExternalLink } from 'lucide-react'
import type { LinkCard } from '../../schema/node'

export function CardLinkMeta({ link }: { link: LinkCard['link'] }) {
  return (
    <div className="card__link-meta">
      <a
        className="card__link-title no-drag"
        href={link.url}
        target="_blank"
        rel="noreferrer noopener"
        draggable={false}
      >
        <span className="card__link-title-text">
          {link.status === 'loading' ? 'Loading…' : link.title || link.url}
        </span>
        <ExternalLink size={12} strokeWidth={2} className="card__link-icon" />
      </a>
    </div>
  )
}
