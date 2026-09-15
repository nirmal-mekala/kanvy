// System-clipboard text write, layered on top of the in-app node clipboard
// (spec §7): ⌘/Ctrl+C also writes the concatenated caption text of every
// selected *card* (containers excluded) to the OS clipboard, newline-
// separated — but only if there's non-empty text (never overwrites the
// OS clipboard with nothing).

import type { Node } from '../schema/node'

export function selectionTextForSystemClipboard(
  nodes: readonly Node[],
): string | undefined {
  const text = nodes
    .filter((node): node is Extract<Node, { type: 'card' }> => {
      return node.type === 'card' && node.content.trim().length > 0
    })
    .map((node) => node.content)
    .join('\n')
  return text.length > 0 ? text : undefined
}

/** Best-effort — a denied/unavailable permission is not an error worth surfacing (the in-app copy already succeeded). */
export function writeTextToSystemClipboard(text: string): void {
  navigator.clipboard?.writeText?.(text)?.catch(() => {
    // ignore
  })
}
