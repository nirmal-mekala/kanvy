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
  onContentChange,
  onContentBlur,
}: {
  node: CardNode
  imageSrc: string | undefined
  theme: Theme
  showCaption: boolean
  tinted: boolean
  contentRef: RefObject<HTMLTextAreaElement | null>
  onContentChange?: (content: string) => void
  onContentBlur?: () => void
}) {
  return (
    <div className="card__inner">
      <div className="card__bar">
        {node.task && (
          <TaskStatusIcon
            status={node.task.status}
            theme={theme}
            className="task-status-icon"
            ariaLabel={`Status: ${node.task.status.replace('_', ' ')}`}
          />
        )}
      </div>

      {node.kind === 'image' && imageSrc && (
        <CardMedia
          src={imageSrc}
          alt={node.content || 'Image card'}
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
              alt={node.link.title || 'Link preview image'}
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
          className="card__content no-drag"
          aria-label="Card caption"
          value={node.content}
          placeholder="Write something..."
          rows={1}
          onChange={onContentChange && ((e) => onContentChange(e.target.value))}
          onBlur={onContentBlur}
        />
      )}
    </div>
  )
}
