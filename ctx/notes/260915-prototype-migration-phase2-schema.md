# kanvy — prototype-migration phase 2: schema alignment (draft)

## Status of this document

Draft deliverable for prototype-migration phase 2 of
`ctx/prompt/260915-migration-process.md` ("align on schema"). Builds on
`ctx/notes/260915-kanvy-spec.md` (prototype-migration phase 1) and resolves the
items that document explicitly deferred to this phase (its §14). Also sketches
— but does not build — multiboard and a future JSON-on-disk + `json-server`
backend, per the migration prompt's prototype-migration phase 2 scope.

This is a draft: decisions below marked **(confirmed)** were made directly by
the developer in this session; everything else is a proposal open to
revision before prototype-migration phase 3 (tooling/config) begins.

## 1. Node collection shape — resolved

**(confirmed)** v0 uses a single unified `nodes` array, discriminated by
`type`, rather than separate `cards`/`containers` arrays. This resolves
prototype-migration phase 1 Q6.

Rationale: matches the JSON Canvas top-level shape used as inspiration,
removes the need for a typed edge-endpoint union (an edge just references a
`nodeId` into the one collection), and lets array order double as z-index
(useful since containers must always render beneath cards — today a
special-cased render rule, here just "containers happen to sort first").

## 2. v0 schema

```ts
type NodeId = string

interface NodeBase {
  id: NodeId
  x: number
  y: number
  w: number
  h: number                      // stored per prototype-migration phase 1 §2.4; rendered content is source of truth
  color: ColorKey                 // 'gray' | 'coral' | 'orange' | 'amber' | 'lime' | 'teal' | 'sky' | 'violet' | 'pink'
  parentId?: NodeId                // formal ownership, prototype-migration phase 1 §2.3
  task?: { status: 'todo' | 'blocked' | 'in_progress' | 'done' }  // (confirmed) nested shape
  createdAt: string                // ISO-8601
  updatedAt: string
}

interface CardBase extends NodeBase {
  type: 'card'
  content: string   // caption/body text, valid for every kind
}

interface TextCard extends CardBase {
  kind: 'text'
  size: 'regular' | 'big'
}

interface ImageCard extends CardBase {
  kind: 'image'
  imageId: string
}

interface LinkCard extends CardBase {
  kind: 'link'
  link: {
    url: string
    title?: string
    imageUrl?: string
    status: 'loading' | 'ready' | 'error'
  }
}

type CardNode = TextCard | ImageCard | LinkCard

interface ContainerNode extends NodeBase {
  type: 'container'
  pattern: PatternKey   // 'none' | 'diagonal' | 'graph-paper' | 'wiggle' | 'plus' | 'jupiter' | 'topography' | 'yyy' | 'corkscrew'
}

type Node = CardNode | ContainerNode

interface Edge {
  id: string
  fromNodeId: NodeId
  fromSide: 'top' | 'right' | 'bottom' | 'left'
  toNodeId: NodeId
  toSide: 'top' | 'right' | 'bottom' | 'left'
  direction: 'none' | 'forward' | 'backward'
  createdAt: string
  updatedAt: string
}

interface Board {
  version: number
  nodes: Node[]
  edges: Edge[]
  images: Record<string, string>   // last key when serialized, per prototype-migration phase 1 §2.8
}
```

Notes:

- `CardNode` is a discriminated union over `kind` (`TextCard | ImageCard |
  LinkCard`), not one interface with optional `size`/`imageId`/`link`
  fields. This makes the invalid combinations prototype-migration phase 1 explicitly forbids —
  `kind: 'image'` with `size: 'big'`, `kind: 'link'` with `imageId` set,
  etc. — unrepresentable in the type system rather than merely
  undocumented. `size` only exists on `TextCard`; `imageId` only on
  `ImageCard`; `link` only on `LinkCard`. A `switch (node.kind)` narrows to
  the exact variant, so e.g. `card.link.status` is inaccessible without
  first checking `kind === 'link'`.
  - Converting a card between kinds (per prototype-migration phase 1 §2.2/§5.3/§5.4 — e.g. a
    text card becoming an image card on paste) is therefore a full object
    replacement at the type level, not a field mutation — matches the
    actual behavior (dropping `size: 'big'` back to `'regular'`, discarding
    stale `link`/`imageId` data) rather than fighting it.
- `link` is nested rather than flat `linkUrl`/`linkTitle`/`linkImageUrl`/
  `linkStatus` — groups the fields that only make sense together.
- `w`/`h`/`x`/`y` keep the prototype's short names rather than JSON Canvas's
  `width`/`height` — no functional reason to rename, noted as a deliberate
  divergence.
- `task` is nested (`{ status }`) rather than a flat `taskStatus` string
  **(confirmed)** — makes "is this a task" (`task` present) and "what
  status" (`task.status`) two explicit, separate questions.

## 3. Multiboard — design sketch, not built

Smallest change consistent with §2: a `Board` becomes one document among
many, referenced by an index.

```ts
interface BoardMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

interface BoardIndex {
  version: number
  boards: BoardMeta[]
}
```

Each board's full content (`nodes`/`edges`/`images`) stays a separate
document, keyed by `BoardMeta.id`. This is deferred to prototype-migration phase 2+ per the
migration prompt — not implemented now, just shaped so it doesn't require a
schema break later.

## 4. Future JSON-on-disk + `json-server` backend — design sketch, not built

**(confirmed)** Layout: one shared `db.json`, `json-server`-idiomatic flat
top-level collections rather than one file per board:

```json
{
  "boards": [{ "id": "b1", "name": "...", "createdAt": "...", "updatedAt": "..." }],
  "nodes": [{ "id": "n1", "boardId": "b1", "type": "card", "kind": "text", "...": "..." }],
  "edges": [{ "id": "e1", "boardId": "b1", "fromNodeId": "n1", "toNodeId": "n2", "...": "..." }],
  "images": [{ "id": "img1", "boardId": "b1", "data": "data:image/..." }]
}
```

Consequences of this choice, to carry into prototype-migration phase 2+/implementation:

- `nodes`/`edges`/`images` all gain a `boardId` foreign key not present in
  the single-board `Board` schema in §2 — the REST resources are
  `GET /nodes?boardId=x`, `GET /edges?boardId=x`, etc., filtered client-side
  of `json-server` itself.
- `images` moves from an in-board map (`Record<string, string>`, §2.8's
  "last key" ordering trick) to its own flat collection, since a shared
  `db.json` can't nest per-board maps and still be `json-server`-routable.
  The diff-ordering concern from prototype-migration phase 1 §2.8 doesn't carry over as directly
  — worth revisiting once this is actually built, not now.
  **(deferred)**
- This is a bigger structural break from the localStorage-era `Board` shape
  in §2 than the one-file-per-board alternative would have been — accepted
  as the cost of getting idiomatic `json-server` REST semantics for free.
- Client-side, the app would still operate on one `Board`-shaped in-memory
  document at a time (composed by filtering the flat collections by
  `boardId` on load, and flattening back into a REST write per node/edge
  mutation) — the wire/disk shape and the in-memory editing shape are not
  required to match 1:1.

## 5. JSON Canvas alignment — what's adopted vs. deliberately diverged

**Adopted:**

- Top-level `nodes`/`edges` array shape (§1 above).
- Array-order-as-z-index for nodes.
- `fromSide`/`toSide` naming — already matches the prototype's own naming.

**Deliberately diverged:**

- JSON Canvas's `group` node type has no formal parent/child relationship —
  containment is purely visual/geometric, matching the *prototype's*
  pre-migration behavior. prototype-migration phase 1 §2.3 already decided to add `parentId`
  formal ownership to containers — this is an intentional improvement over
  JSON Canvas, not an alignment gap to close.
- JSON Canvas's `color` is a loose `canvasColor` (hex or one of 6 numbered
  presets). Kanvy's `ColorKey` stays the existing fixed 9-color Nord-derived
  palette (prototype-migration phase 1 §3) — no free-hex colors, no renumbering to match JSON
  Canvas's preset scheme.
- JSON Canvas has no task-status, recency-mode, or pattern-background
  concept — these remain kanvy-specific, not mapped to any JSON Canvas
  field.

## 6. Open items still deferred beyond prototype-migration phase 2

- Concrete `PatternKey`/`ColorKey` as TypeScript string-literal unions vs.
  enums — a prototype-migration phase 3 (tooling/lint config) style call, not
  a schema-shape question.
- Whether the future disk-backed backend's REST layer is `json-server`
  as-is or a thin custom server in front of the same `db.json` shape —
  §4 assumes `json-server` per the migration prompt, not re-litigated here.
- Multiboard UI/switching behavior (only the storage shape is sketched in
  §3) — out of scope until multiboard is actually built.
