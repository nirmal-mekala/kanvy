// The `?` button (bottom-left of the canvas, matching the prototype's
// placement inside Board.jsx, not the top toolbar) and its shortcut-list
// modal (spec §4.2). A deliberately trimmed list — "obvious" whiteboard
// conventions (drag-to-move, click-to-select, Cmd+D/C/V/Z, delete, etc.)
// are left out, ported verbatim from the prototype's own `SHORTCUTS` list.

import { CircleHelp } from 'lucide-react'
import { Modal } from '../modal/Modal'

const SHORTCUTS: readonly [string, string][] = [
  ['⌘/Ctrl + click + drag', 'Create a container'],
  ['Drag & drop an image file', 'Create an image card'],
  ['Type a URL, then a space', 'Convert the card into a link'],
  [
    '⌘/Ctrl + V (with an image)',
    'Paste an image into a focused/selected card, or create a new image card',
  ],
  [
    '⌘/Ctrl + V (with a link)',
    'Paste a link into a focused/selected card, or create a new link card',
  ],
  ['⌘/Ctrl + Shift + Enter', 'Zoom out to fit everything in view'],
]

export function HelpPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <button
        type="button"
        className="board__zoom-btn"
        onClick={() => onOpenChange(!open)}
        onPointerDown={(e) => e.stopPropagation()}
        title="Keyboard shortcuts"
      >
        <CircleHelp size={16} strokeWidth={2} />
      </button>

      {open && (
        <Modal
          title="Keyboard shortcuts"
          titleId="help-panel__title"
          onDismiss={() => onOpenChange(false)}
          dismissLabel="Close keyboard shortcuts"
          dialogClassName="help-panel"
          backdropClassName="help-backdrop"
        >
          <table className="help-panel__table">
            <tbody>
              {SHORTCUTS.map(([key, desc]) => (
                <tr key={key}>
                  <td className="help-panel__key">{key}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </>
  )
}
