// Field-name mapping between this app's (camelCase) entity fields and a
// backend's column names — a building block dialects compose, not part of
// the Dialect contract itself (api/dialects/types.ts). A mapping is a
// casing rule plus optional per-collection overrides that win over it,
// e.g. `{ nodes: { position: 'item_pos' } }` for a backend whose column
// isn't simply the snake_case of the app's field.

import type { Collection } from './types'

type Casing = 'identity' | 'snake'

/** Per-collection overrides: app field name → wire field name. */
export type FieldRenames = Partial<
  Record<Collection, Readonly<Record<string, string>>>
>

export interface FieldMapping {
  toWireField(collection: Collection, field: string): string
  fromWireField(collection: Collection, field: string): string
  toWireRow(
    collection: Collection,
    row: Readonly<Record<string, unknown>>,
  ): Record<string, unknown>
  fromWireRow(
    collection: Collection,
    row: Readonly<Record<string, unknown>>,
  ): Record<string, unknown>
}

/** `linkImageUrl` → `link_image_url`. */
export function camelToSnake(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/** `link_image_url` → `linkImageUrl`. */
export function snakeToCamel(field: string): string {
  return field.replace(/_([a-z0-9])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  )
}

const CASINGS: Record<Casing, [(f: string) => string, (f: string) => string]> =
  {
    identity: [(field) => field, (field) => field],
    snake: [camelToSnake, snakeToCamel],
  }

function mapKeys(
  row: Readonly<Record<string, unknown>>,
  mapKey: (key: string) => string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [mapKey(key), value]),
  )
}

export function createFieldMapping(
  casing: Casing,
  renames: FieldRenames = {},
): FieldMapping {
  const [toWireCase, fromWireCase] = CASINGS[casing]
  const reverse = Object.fromEntries(
    Object.entries(renames).map(([collection, table]) => [
      collection,
      Object.fromEntries(
        Object.entries(table ?? {}).map(([app, wire]) => [wire, app]),
      ),
    ]),
  ) as FieldRenames
  const toWireField = (collection: Collection, field: string) =>
    renames[collection]?.[field] ?? toWireCase(field)
  const fromWireField = (collection: Collection, field: string) =>
    reverse[collection]?.[field] ?? fromWireCase(field)
  return {
    toWireField,
    fromWireField,
    toWireRow: (collection, row) =>
      mapKeys(row, (key) => toWireField(collection, key)),
    fromWireRow: (collection, row) =>
      mapKeys(row, (key) => fromWireField(collection, key)),
  }
}
