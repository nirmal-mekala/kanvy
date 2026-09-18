// `.card__inner`'s contents — extracted out of Card.tsx purely to keep
// that component's cognitive complexity under Biome's threshold.
//
// The `kind === 'board'` branch below is the one place this otherwise
// fully prop-driven component reads/writes jotai state directly, rather
// than routing through Canvas.tsx's centralized wiring like every other
// mutation in this component tree. That's deliberate, not an oversight:
// a board card's title lives on `boards[boardRef].title`, not the node
// itself, and `boardFamily`/`renameBoardAtom` (state/atoms/boards.ts) are
// exactly the granular per-id atoms this codebase already uses for this
// shape of lookup (see nodes.ts's `nodeFamily`) — threading a title string
// plus a rename callback through Card.tsx's already-large prop list for
// one card kind would cost more than it buys. `BoardNameEditor` (../board)
// owns the actual name/edit UI, shared with Breadcrumb.tsx.

import { useNavigate } from '@tanstack/react-router'
import { useAtomValue, useSetAtom } from 'jotai'
import { LayoutDashboard } from 'lucide-react'
import type { RefObject } from 'react'
import type { ViewMode } from '../../colors/borderColor'
import type { Theme } from '../../colors/colorKey'
import type { CardNode } from '../../schema/node'
import { boardFamily, renameBoardAtom } from '../../state/atoms/boards'
import { BoardNameEditor } from '../board/BoardNameEditor'
import { CardLinkMeta } from './CardLinkMeta'
import { CardMedia } from './CardMedia'
import { RecencyIndicator } from './RecencyIndicator'
import { TaskStatusIcon } from './TaskStatusIcon'

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from
// e2e/visual-regression specs.
// fallow-ignore-next-line complexity
export function CardBody({
  node,
  imageSrc,
  theme,
  viewMode,
  showCaption,
  tinted,
  contentRef,
  onContentChange,
  onContentBlur,
}: {
  node: CardNode
  imageSrc: string | undefined
  theme: Theme
  viewMode: ViewMode
  showCaption: boolean
  tinted: boolean
  contentRef: RefObject<HTMLTextAreaElement | null>
  onContentChange?: (content: string) => void
  onContentBlur?: () => void
}) {
  const navigate = useNavigate()
  const renameBoard = useSetAtom(renameBoardAtom)
  // `boardFamily('')` (never a real id) when this isn't a board card —
  // keeps the hook call unconditional without needing a real lookup.
  const referencedBoard = useAtomValue(
    boardFamily(node.kind === 'board' ? node.boardRef : ''),
  )

  return (
    <div className="card__inner">
      <div className="card__bar">
        {viewMode === 'recency' && (
          <RecencyIndicator
            updatedAt={node.updatedAt}
            now={new Date()}
            className="recency-indicator"
          />
        )}
        {node.kind === 'board' && (
          // Centered in the bar rather than inline with the name (260918
          // redesign, see ctx/notes/260918-board-node-redesign.md) — a
          // subtle "this is a board" glyph, not competing with the
          // name/edit row for space.
          <LayoutDashboard
            className="card__board-icon"
            size={12}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
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
        <a
          className="card__link-body no-drag"
          href={node.link.url}
          target="_blank"
          rel="noreferrer noopener"
          draggable={false}
        >
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
        </a>
      )}

      {node.kind === 'board' && (
        // Reuses the link node's click-semantics model exactly (border/
        // drag-handle = select, interior click = activate) — the only
        // deviation is *what* activation does: in-app navigation instead
        // of `target="_blank"` (multiboard support design doc §3, revised
        // 260918 — see ctx/notes/260918-board-node-redesign.md — for the
        // single-row name layout and the shared hover-to-edit pattern; the
        // "this is a board" icon lives in the drag bar above, not here).
        <div className="card__board-body no-drag">
          <BoardNameEditor
            title={referencedBoard?.title ?? ''}
            onRename={(value) => renameBoard(node.boardRef, value)}
            onActivate={() =>
              navigate({
                to: '/$boardId',
                params: { boardId: node.boardRef },
              })
            }
          />
        </div>
      )}

      {showCaption && node.kind !== 'board' && (
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
