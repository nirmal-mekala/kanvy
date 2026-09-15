// `.card__inner`'s contents — extracted out of Card.tsx purely to keep
// that component's cognitive complexity under Biome's threshold.

import type { RefObject } from 'react'
import type { Theme } from '../../colors/colorKey'
import type { CardNode } from '../../schema/node'
import { CardLinkMeta } from './CardLinkMeta'
import { CardMedia } from './CardMedia'
import { TaskStatusIcon } from './TaskStatusIcon'

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from
// e2e/visual-regression specs.
// fallow-ignore-next-line complexity
export function CardBody({
  node,
  imageSrc,
  theme,
  showCaption,
  tinted,
  contentRef,
}: {
  node: CardNode
  imageSrc: string | undefined
  theme: Theme
  showCaption: boolean
  tinted: boolean
  contentRef: RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="card__inner">
      <div className="card__bar">
        {node.task && (
          <TaskStatusIcon
            status={node.task.status}
            theme={theme}
            className="task-status-icon"
          />
        )}
      </div>

      {node.kind === 'image' && imageSrc && (
        <CardMedia
          src={imageSrc}
          divided={showCaption}
          tinted={tinted}
          className="card__image"
        />
      )}

      {node.kind === 'link' && (
        <>
          {node.link.imageUrl && (
            <CardMedia
              src={node.link.imageUrl}
              divided={false}
              tinted={tinted}
              className="card__link-image"
            />
          )}
          <CardLinkMeta link={node.link} />
        </>
      )}

      {showCaption && (
        <textarea
          ref={contentRef}
          className="card__content"
          value={node.content}
          placeholder="Write something..."
          readOnly
          rows={1}
        />
      )}
    </div>
  )
}
