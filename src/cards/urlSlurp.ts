// Phase 6 stub — signatures only, per ctx/notes/260915-kanvy-spec.md §5.4.
// Phase 7 Stage 6 fills in the real logic.

export interface UrlMatch {
  url: string
  start: number
  end: number
}

export interface SlurpMatch {
  url: string
  /** Text with the slurped URL (and the trigger whitespace, if any) removed. */
  remainingText: string
}

/** The first URL in `text`, or undefined if none — only the first URL is ever slurped. */
export function findFirstUrl(_text: string): UrlMatch | undefined {
  throw new Error('not implemented — phase 7')
}

/** True when `text` (trimmed) is a URL and nothing else. */
export function isPlainUrl(_text: string): boolean {
  throw new Error('not implemented — phase 7')
}

/**
 * Live-typing trigger: the moment a space/newline is typed immediately
 * after the first URL in `text`, at cursor position `cursorPos` (spec
 * §5.4a). Returns undefined if no URL is immediately before the cursor's
 * triggering whitespace.
 */
export function detectSlurpOnType(
  _text: string,
  _cursorPos: number,
): SlurpMatch | undefined {
  throw new Error('not implemented — phase 7')
}

/**
 * Blur trigger: the first URL is slurped if it's the last thing in `text`
 * — nothing typed after it yet (spec §5.4b).
 */
export function detectSlurpOnBlur(_text: string): SlurpMatch | undefined {
  throw new Error('not implemented — phase 7')
}
