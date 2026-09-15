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

const URL_PATTERN = /https?:\/\/[^\s]+/

/** The first URL in `text`, or undefined if none — only the first URL is ever slurped. */
export function findFirstUrl(text: string): UrlMatch | undefined {
  const match = URL_PATTERN.exec(text)
  if (!match) return undefined
  return {
    url: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }
}

/** True when `text` (trimmed) is a URL and nothing else. */
export function isPlainUrl(text: string): boolean {
  const trimmed = text.trim()
  const match = URL_PATTERN.exec(trimmed)
  return (
    match !== null && match.index === 0 && match[0].length === trimmed.length
  )
}

function isTriggerWhitespace(char: string | undefined): boolean {
  return char === ' ' || char === '\n'
}

/**
 * Live-typing trigger: the moment a space/newline is typed immediately
 * after the first URL in `text`, at cursor position `cursorPos` (spec
 * §5.4a). Returns undefined if no URL is immediately before the cursor's
 * triggering whitespace.
 */
export function detectSlurpOnType(
  text: string,
  cursorPos: number,
): SlurpMatch | undefined {
  if (!isTriggerWhitespace(text[cursorPos - 1])) return undefined

  const match = findFirstUrl(text)
  if (!match) return undefined
  if (!isTriggerWhitespace(text[match.end])) return undefined

  return {
    url: match.url,
    remainingText: text.slice(0, match.start) + text.slice(match.end + 1),
  }
}

/**
 * Blur trigger: the first URL is slurped if it's the last thing in `text`
 * — nothing typed after it yet (spec §5.4b).
 */
export function detectSlurpOnBlur(text: string): SlurpMatch | undefined {
  const match = findFirstUrl(text)
  if (!match) return undefined
  if (match.end !== text.length) return undefined

  return {
    url: match.url,
    remainingText: text.slice(0, match.start).trimEnd(),
  }
}
