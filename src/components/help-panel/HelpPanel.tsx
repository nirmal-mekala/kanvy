// The `?` button (bottom-left of the canvas, matching the prototype's
// placement inside Board.jsx, not the top toolbar) and its shortcut-list
// modal (spec §4.2). A deliberately trimmed list — "obvious" whiteboard
// conventions (drag-to-move, click-to-select, Cmd+D/C/V/Z, delete, etc.)
// are left out, ported verbatim from the prototype's own `SHORTCUTS` list.

import { CircleHelp } from 'lucide-react'
import { useEffect } from 'react'

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
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

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
        <div
          className="modal-backdrop help-backdrop"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* A real, keyboard-operable button standing in for the backdrop
              itself — clicking (or Enter/Space-activating) anywhere outside
              the panel dismisses it, same as Escape or the `?` button. */}
          <button
            type="button"
            className="modal-backdrop__dismiss"
            aria-label="Close keyboard shortcuts"
            onClick={() => onOpenChange(false)}
          />
          <div
            className="help-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <h2 className="help-panel__title">Keyboard shortcuts</h2>
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
          </div>
        </div>
      )}
    </>
  )
}
