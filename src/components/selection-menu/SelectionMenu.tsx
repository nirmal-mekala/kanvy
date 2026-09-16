// One menu for the whole current selection, however mixed (spec §4.3/§3/
// §5.2/§6.1) — anchored to the combined bounding box by the caller
// (Canvas.tsx). Ported from the prototype's inline selection-menu JSX in
// Board.jsx onto Tailwind + this migration's discriminated `Node` union.

import { Heading1, List, ListTodo, Type } from 'lucide-react'
import {
  resolveColorHex,
  swatchBackground,
  type Theme,
} from '../../colors/colorKey'
import { patternBackgroundImage } from '../../colors/patterns'
import {
  type CardNode,
  type ColorKey,
  ColorKeySchema,
  type ContainerNode,
  type PatternKey,
  PatternKeySchema,
  type TaskStatus,
} from '../../schema/node'
import { TaskStatusIcon } from '../card/TaskStatusIcon'
import { commonValue } from './commonValue'

const COLOR_KEYS = ColorKeySchema.options
const PATTERN_KEYS = PatternKeySchema.options
const TASK_STATUSES: TaskStatus[] = ['todo', 'blocked', 'in_progress', 'done']

// CRAP scoring penalizes this component's 0% coverage — component tests
// aren't a required tier for v0 (spec §13); real coverage comes from
// e2e/visual-regression specs, which fallow's static analysis can't see.
// fallow-ignore-next-line complexity
export function SelectionMenu({
  selectedCards,
  selectedContainers,
  theme,
  x,
  y,
  onSetColor,
  onSetPattern,
  onSetTextSize,
  onSetTaskKind,
  onSetTaskStatus,
}: {
  selectedCards: readonly CardNode[]
  selectedContainers: readonly ContainerNode[]
  theme: Theme
  x: number
  y: number
  onSetColor: (color: ColorKey) => void
  onSetPattern: (pattern: PatternKey) => void
  onSetTextSize: (size: 'regular' | 'big') => void
  onSetTaskKind: (kind: 'default' | 'task') => void
  onSetTaskStatus: (status: TaskStatus) => void
}) {
  const taskItems = [...selectedCards, ...selectedContainers]
  const commonColor = commonValue(taskItems.map((item) => item.color))
  const commonPattern = commonValue(selectedContainers.map((c) => c.pattern))

  const allCardsAreText =
    selectedCards.length > 0 && selectedCards.every((c) => c.kind === 'text')
  const commonTextSize = allCardsAreText
    ? commonValue(selectedCards.map((c) => (c.kind === 'text' ? c.size : null)))
    : null

  const commonTaskKind = commonValue(
    taskItems.map((item) => (item.task ? 'task' : 'default')),
  )
  const allSelectedAreTasks =
    taskItems.length > 0 && taskItems.every((item) => item.task)
  const commonTaskStatus = commonValue(
    taskItems.filter((item) => item.task).map((item) => item.task?.status),
  )

  return (
    <div
      className="selection-menu"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="selection-menu__grid">
        {COLOR_KEYS.map((color) => (
          <button
            key={color}
            type="button"
            className={`swatch${commonColor === color ? ' swatch--active' : ''}`}
            style={{ background: swatchBackground(color) }}
            title={color}
            onClick={() => onSetColor(color)}
          />
        ))}
      </div>

      {selectedContainers.length > 0 && (
        <>
          <div className="selection-menu__divider" />
          <div className="selection-menu__grid">
            {PATTERN_KEYS.map((pattern) => (
              <button
                key={pattern}
                type="button"
                className={`pattern-swatch${commonPattern === pattern ? ' pattern-swatch--active' : ''}`}
                style={{
                  backgroundImage: patternBackgroundImage(
                    pattern,
                    resolveColorHex('gray', theme),
                    1,
                  ),
                }}
                title={pattern}
                onClick={() => onSetPattern(pattern)}
              />
            ))}
          </div>
        </>
      )}

      {allCardsAreText && (
        <>
          <div className="selection-menu__divider" />
          <div className="selection-menu__grid">
            <button
              type="button"
              className={`textsize-swatch${commonTextSize === 'regular' ? ' textsize-swatch--active' : ''}`}
              title="Regular text"
              onClick={() => onSetTextSize('regular')}
            >
              <Type size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={`textsize-swatch${commonTextSize === 'big' ? ' textsize-swatch--active' : ''}`}
              title="Big text"
              onClick={() => onSetTextSize('big')}
            >
              <Heading1 size={14} strokeWidth={2} />
            </button>
          </div>
        </>
      )}

      <div className="selection-menu__divider" />
      <div className="selection-menu__grid">
        <button
          type="button"
          className={`task-swatch${commonTaskKind === 'default' ? ' task-swatch--active' : ''}`}
          title="Default"
          onClick={() => onSetTaskKind('default')}
        >
          <List size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`task-swatch${commonTaskKind === 'task' ? ' task-swatch--active' : ''}`}
          title="Task"
          onClick={() => onSetTaskKind('task')}
        >
          <ListTodo size={14} strokeWidth={2} />
        </button>
      </div>

      {allSelectedAreTasks && (
        <>
          <div className="selection-menu__divider" />
          <div className="selection-menu__grid">
            {TASK_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={`task-swatch${commonTaskStatus === status ? ' task-swatch--active' : ''}`}
                title={status.replace('_', ' ')}
                onClick={() => onSetTaskStatus(status)}
              >
                <TaskStatusIcon status={status} theme={theme} size={14} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
