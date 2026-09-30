// Ported from the original prototype's `isEditableTarget` (dom.js) — used
// to tell a real caption-editing keystroke/paste apart from one meant for
// a board-level shortcut.

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}
