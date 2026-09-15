// An image or link-preview image inside a card (spec §5.3/§5.4) — extracted
// out of Card.tsx purely to keep that component's cognitive complexity
// under Biome's threshold; no behavior of its own.

export function CardMedia({
  src,
  divided,
  tinted,
  className,
}: {
  src: string
  divided: boolean
  tinted: boolean
  className: string
}) {
  return (
    <div className={`card__media${divided ? ' card__media--divided' : ''}`}>
      <img className={className} src={src} alt="" draggable={false} />
      {tinted && <div className="card__media-tint" aria-hidden="true" />}
    </div>
  )
}
