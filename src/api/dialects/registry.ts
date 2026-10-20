// The backend presets the settings modal offers (ctx/notes/
// 261020-network-dialects.md). A connection persists only its dialect's
// `id`; this registry turns it back into the dialect object.

import { jsonServerDialect } from './jsonServer'
import { postgrestDialect } from './postgrest'
import type { Dialect } from './types'

/** In dropdown order. */
export const DIALECTS: readonly Dialect[] = [
  jsonServerDialect,
  postgrestDialect,
]

/** The dialect a connection saved before presets existed gets — json-server was the only backend then. */
export const DEFAULT_DIALECT_ID = jsonServerDialect.id

export function isDialectId(id: string): boolean {
  return DIALECTS.some((dialect) => dialect.id === id)
}

/** Throws for an unknown id — persisted ids are normalized on read (state/atoms/networkSettings.ts), so one reaching here is a bug. */
export function getDialect(id: string): Dialect {
  const dialect = DIALECTS.find((candidate) => candidate.id === id)
  if (!dialect) throw new Error(`Unknown backend dialect "${id}"`)
  return dialect
}
