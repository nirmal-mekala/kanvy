// Computes the viewport pixel position of the caret inside an <input> or
// <textarea> at a given character offset, so the emoji dropdown
// (EmojiSuggestionMenu.tsx) can anchor itself right under the `:query`
// being typed instead of the field as a whole. Standard mirror-element
// technique: an offscreen div is given the field's exact viewport
// position, size, and text-affecting styles, filled with the same text up
// to the caret, and a marker span appended after it — since the mirror is
// laid out identically to the field, the marker's own bounding rect *is*
// the caret's position, wrapping included.
//
// CRAP scoring penalizes this function's 0% coverage — it's a DOM-layout
// boundary (getBoundingClientRect/getComputedStyle), not pure application
// logic, and jsdom has no real layout engine to exercise it meaningfully;
// real coverage comes from e2e (e2e/*.spec.ts) in a real browser.
// fallow-ignore-next-line complexity

const MIRROR_STYLE_PROPERTIES = [
  'box-sizing',
  'width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-style',
  'font-style',
  'font-variant',
  'font-weight',
  'font-stretch',
  'font-size',
  'font-family',
  'line-height',
  'text-align',
  'text-transform',
  'text-indent',
  'letter-spacing',
  'word-spacing',
  'tab-size',
] as const

export interface CaretCoordinates {
  top: number
  left: number
  height: number
}

// CRAP-exempt, see the file-top note.
// fallow-ignore-next-line complexity
export function getCaretCoordinates(
  field: HTMLInputElement | HTMLTextAreaElement,
  position: number,
): CaretCoordinates {
  const isInput = field.tagName === 'INPUT'
  const computed = window.getComputedStyle(field)
  const fieldRect = field.getBoundingClientRect()

  const mirror = document.createElement('div')
  const style = mirror.style
  style.position = 'fixed'
  style.top = `${fieldRect.top}px`
  style.left = `${fieldRect.left}px`
  style.visibility = 'hidden'
  style.whiteSpace = isInput ? 'pre' : 'pre-wrap'
  style.wordWrap = 'break-word'
  style.overflow = 'hidden'

  for (const prop of MIRROR_STYLE_PROPERTIES) {
    style.setProperty(prop, computed.getPropertyValue(prop))
  }

  document.body.appendChild(mirror)
  mirror.textContent = field.value.slice(0, position)

  const marker = document.createElement('span')
  marker.textContent = field.value.slice(position) || '​'
  mirror.appendChild(marker)

  mirror.scrollTop = field.scrollTop
  mirror.scrollLeft = field.scrollLeft

  const markerRect = marker.getBoundingClientRect()
  document.body.removeChild(mirror)

  return {
    top: markerRect.top,
    left: markerRect.left,
    height:
      markerRect.height ||
      Number.parseFloat(computed.getPropertyValue('font-size')),
  }
}
