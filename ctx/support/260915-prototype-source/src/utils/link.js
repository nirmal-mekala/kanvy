// Trailing punctuation a URL often ends a sentence with, but which isn't
// actually part of the link (e.g. "check out https://example.com.").
const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/

function stripTrailingPunctuation(url) {
  return url.replace(TRAILING_PUNCTUATION, '')
}

function isHttpUrl(str) {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// True only when the *entire* (trimmed) text is one URL and nothing else —
// this is what distinguishes "paste a link" (create/convert to a link node)
// from "paste some text that happens to mention a link" (handled by the
// typing-based slurp below instead).
export function isPlainUrl(text) {
  const trimmed = text?.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  return isHttpUrl(trimmed)
}

// Finds the first URL in `text`, if any, that's a candidate for being
// "slurped" out of a plain text note into a link node. Only the first match
// is ever considered — any further URL later in the same text is left in
// place as plain text, per spec.
//
// `requireTrailingSpace: true` is the live-typing trigger (a URL becomes
// slurpable the moment a space/newline is typed right after it, so it
// doesn't fire mid-URL while still being typed). `false` is the blur-time
// catch-all, which also accepts a URL sitting right at the end of the text
// with nothing typed after it yet.
export function findSlurpableUrl(text, { requireTrailingSpace }) {
  const match = text.match(/https?:\/\/\S+/)
  if (!match) return null

  const start = match.index
  const rawEnd = start + match[0].length
  const url = stripTrailingPunctuation(match[0])
  if (!url || !isHttpUrl(url)) return null

  const trailingChar = text.slice(rawEnd, rawEnd + 1)
  const hasTrailingSpace = trailingChar === ' ' || trailingChar === '\n'
  const atEnd = rawEnd === text.length

  if (requireTrailingSpace && !hasTrailingSpace) return null
  if (!requireTrailingSpace && !hasTrailingSpace && !atEnd) return null

  const before = text.slice(0, start)
  const after = text.slice(hasTrailingSpace ? rawEnd + 1 : rawEnd)
  // Collapse whatever whitespace is left behind so removing the URL doesn't
  // leave a stray blank line or double space.
  const remaining = `${before}${after}`.replace(/^\s+|\s+$/g, '').replace(/[ \t]{2,}/g, ' ')

  return { url, remaining }
}
