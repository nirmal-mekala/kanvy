// An image or link-preview image inside a card (spec §5.3/§5.4) — extracted
// out of Card.tsx purely to keep that component's cognitive complexity
// under Biome's threshold; no behavior of its own besides tracking whether
// the loaded image is smaller than the card's fixed width, to avoid
// upscaling it (see `.card__media--small` in index.css).

import { useState } from 'react'
import { CARD_WIDTH } from '../../geometry/constants'

export function CardMedia({
  src,
  alt,
  divided,
  tinted,
  className,
}: {
  src: string
  /** Spec §11: meaningful images (a card's own photo, a link's preview)
   * get real alt text — the card's caption or the link's title, passed in
   * by the caller since CardMedia doesn't know which. */
  alt: string
  divided: boolean
  tinted: boolean
  className: string
}) {
  const [small, setSmall] = useState(false)

  return (
    <div
      className={`card__media no-drag${divided ? ' card__media--divided' : ''}${small ? ' card__media--small' : ''}`}
    >
      <div className="card__media-frame">
        <img
          className={className}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(e) => setSmall(e.currentTarget.naturalWidth < CARD_WIDTH)}
        />
        {tinted && <div className="card__media-tint" aria-hidden="true" />}
      </div>
    </div>
  )
}
