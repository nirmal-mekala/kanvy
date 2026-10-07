// Response validation for network mode's reads (schema v6, ctx/notes/
// 261006-root-board-isroot.md). Every entry a REST read returns is parsed
// against this app's own Zod schema before it reaches app state — a
// backend whose data doesn't match the current schema (e.g. a `boards`
// entry from before `isRoot` existed) fails the load loudly, naming the
// offending entry and field, rather than being silently coerced or
// rendered half-broken. Deliberately no legacy normalization here
// (contrast schema/legacy.ts for localStorage): fixing server data is the
// server's job. Unknown extra fields are tolerated and stripped (schemas
// are not `.strict()`) — only missing/mistyped known fields fail.

import type { z } from 'zod'

/** Thrown when a REST response doesn't match this app's schema — its `message` is meant to be shown to the user as-is. */
export class ResponseValidationError extends Error {
  override name = 'ResponseValidationError'
}

/** At most this many invalid entries are spelled out in one error message; the rest are counted. */
const MAX_REPORTED_ENTRIES = 3

function entryLabel(entry: unknown, index: number): string {
  const id =
    typeof entry === 'object' && entry !== null && 'id' in entry
      ? entry.id
      : undefined
  return id === undefined ? `entry #${index}` : `id ${JSON.stringify(id)}`
}

function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join('.')}: ${issue.message}`
        : issue.message,
    )
    .join(', ')
}

/**
 * Parses every entry of `entries` against `schema`, returning the parsed
 * entries, or throwing one `ResponseValidationError` describing every
 * invalid entry (up to `MAX_REPORTED_ENTRIES`). `source` names the request
 * in the message, e.g. `'GET /boards'`.
 */
export function validateEntries<S extends z.ZodType>(
  schema: S,
  entries: readonly unknown[],
  source: string,
): z.infer<S>[] {
  const parsed: z.infer<S>[] = []
  const failures: string[] = []
  entries.forEach((entry, index) => {
    const result = schema.safeParse(entry)
    if (result.success) {
      parsed.push(result.data)
    } else {
      failures.push(
        `${entryLabel(entry, index)} (${describeIssues(result.error.issues)})`,
      )
    }
  })
  if (failures.length === 0) return parsed
  const reported = failures.slice(0, MAX_REPORTED_ENTRIES).join('; ')
  const remainder = failures.length - MAX_REPORTED_ENTRIES
  throw new ResponseValidationError(
    `${source} returned ${failures.length} invalid ${
      failures.length === 1 ? 'entry' : 'entries'
    }: ${reported}${remainder > 0 ? `; and ${remainder} more` : ''}`,
  )
}
