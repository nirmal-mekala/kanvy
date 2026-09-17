# kanvy — v0 spec

## Status of this document

This is the prototype-migration phase 1 deliverable of the migration described in
`ctx/prompt/260915-migration-process.md`: a spec of the *existing prototype's*
behavior, corrected only where the migration prompt and the developer
explicitly called for a data-model fix. It is not a spec for new features.

Sources, in order of authority when they conflicted:

1. `ctx/notes/260915-prototype-migration-phase1-questionnaire.md` — developer decisions (highest authority; overrides 2–4 wherever they conflict)
2. `ctx/support/260915-dev-kanvy-natural-language-description.md` — developer's own description of the app
3. `ctx/support/260915-prototype-source/` — the prototype's source code (source of truth for anything not covered by 1–2)
4. `ctx/support/260915-prototype-claude-convos/dev-input.json` — the prompt history that produced the prototype (used to resolve ambiguity/intent, lowest authority)

Anything marked **(wart, keep)** is known-imperfect behavior the developer
explicitly chose to preserve rather than fix in this migration. Anything
marked **(deferred to prototype-migration phase 2)** is a real open question, but one that
belongs to schema/taxonomy alignment, not this document.

## 1. What kanvy is

An opinionated, single-user, infinite canvas / whiteboarding app. A board is
one JSON document containing nodes (cards, containers) and edges connecting
them. Presently persisted to `localStorage`; prototype-migration phase 2 considers a JSON-on-disk
+ REST backend and multiboard support, both out of scope here.

**In scope for this migration:** TypeScript, Tailwind, Jotai, testing,
debouncing hygiene, de-duplication, file-size discipline, linting, better
error handling, baseline a11y, and a corrected data model.

**Out of scope:** any new user-facing feature or behavior change beyond what
this document calls out. Preserve functionality "warts and all."

## 2. Data model (v0)

### 2.1 Naming (per questionnaire Q1–Q3)

- The top-level primitives are **nodes** and **edges**.
- A node is either a **card** (was: card/note) or a **container** (was:
  group/border/grouping box). Both are nodes; edges are a distinct concept
  connecting two nodes.
- No "project" concept. "Task" is the only status-bearing label, applicable
  to any card or container (see §6).
- Whether `nodes` should be one physically unified array (vs. separate
  `cards`/`containers` arrays as today) is explicitly **deferred to
  prototype-migration phase 2** (questionnaire Q6) — this doc uses the
  conceptual name "node" but does not
  mandate a specific array shape.

### 2.2 Card kinds — discriminated union (per Q2)

Today's flat-optional-fields shape (`imageId`, `linkUrl` as optional fields
with convention-enforced mutual exclusion) is a wart to fix. v0 should model
a card's kind explicitly:

```
kind: 'text' | 'image' | 'link'
size: 'regular' | 'h1' | 'h2' | 'h3'   // valid only when kind === 'text'
```

Rules to preserve from current behavior:
- A heading size (`h1`/`h2`/`h3`) is only ever valid for `kind: 'text'`.
  Converting a heading-sized card to `image` or `link` drops the heading
  sizing and returns it to the regular text card's fixed width /
  content-driven height.
- `image` and `link` are mutually exclusive — a card is never both.
- A card of any kind may have caption text (`content`); image/link cards
  hide the caption textarea when empty and not selected.

### 2.3 Container nesting — spatial ("sticky") membership (v0.1, reverting Q5)

**v0.1 supersedes this section's original v0 decision.** v0 added a formal,
stored `parentId` ownership field (per Q5, see
`ctx/notes/260915-prototype-migration-phase1-questionnaire.md`), assigned
explicitly on drop, on ctrl/cmd-drag container creation, and remapped on
copy/paste and ⌘/Ctrl+D duplicate. In practice this needed bespoke
assignment/remapping logic at every one of those mutation sites, and each
one accumulated its own bug independently (auto-parenting on drag-in,
z-order at container creation, relationship-loss on paste, the same on
duplicate, duplicate z-order interleaving, and a dragged node's z-order
during the gesture) over the course of implementing and fixing it. The
`parentId` field is **removed from the schema entirely** (schema v2,
"v0.1" — see `ctx/notes/260916-v0.1-spatial-containers.md` for the full
write-up and rationale) and container membership reverts to the original
prototype's model: **purely spatial, re-derived fresh every time it's
needed, never stored**.

- What "contains" what is answered by bounding-box geometry alone
  (`containers/containment.ts`), computed at the moment it's needed — e.g.
  once, at the start of a drag (`computeCarryIds`) — never continuously and
  never persisted.
- Dragging a container carries along every node **completely within** its
  own bounds — a node that only partially overlaps the dragged container
  (merely touching or straddling its edge) is left behind, not carried.
  Requiring full containment also settles the ancestor-vs-descendant
  question for free: an ancestor's rect is always at least as large as the
  dragged one, so it can never itself be completely within it — no
  separate exclusion check needed, unlike a plain overlap test (which is
  symmetric and would otherwise require one). This is a single flat pass
  over every other node, not a tree walk — a card nested several
  containers deep is picked up directly because it's completely within
  the outermost dragged container's rect too, not just the inner one.
  (An earlier revision of this rule used plain overlap instead of full
  containment — revised because a node merely brushing a container's edge
  being swept along felt unpredictable and unintentional.)
- Dragging a container that is itself nested inside another container moves
  only that container and whatever it spatially contains — never its
  enclosing container(s) — matching the deeply-nested-group bug fix already
  made in the prototype (dev-input.json, 2026-09-11 19:30).
- Paste and ⌘/Ctrl+D duplicate need no explicit relationship-preservation
  logic at all: both already apply one uniform offset to every copied/
  duplicated node's position (not a per-node recompute), which by itself
  preserves relative spatial arrangement — and so, automatically, whatever
  was spatially contained stays spatially contained.
- Paste still always lands outside of any *existing* container (never
  adopted on paste) — see §7 — by checking the whole copied set's bounding
  box against existing containers, same as before.
- Container render/paint order (DOM order is the only z-index mechanism —
  see §4.5) is a depth-first walk derived from the same geometry: a
  container's "parent," for ordering purposes, is whichever other container
  most tightly (smallest-area) encloses it. This still keeps a newly-drawn
  or newly-duplicated container's whole subtree painting cleanly above
  everything before it, exactly as the formal-ownership version did — see
  `containers/renderOrder.ts`.
- No-fly-zone and other spatially-derived behaviors were never migrated
  away from bounding-box overlap in the first place (per this reversal),
  so they're already consistent with the model above.

### 2.4 Card geometry — height is stored (per Q4)

Today a regular text card's height is purely DOM-derived
(`ResizeObserver`/`offsetHeight`), with a hardcoded `NEW_CARD_HEIGHT_ESTIMATE
= 90` used everywhere geometry is needed without rendering (placement
heuristics, paste bounding box).

v0 correction: the **actual rendered content height is the source of truth**
and flows one-way into the data model whenever it changes (i.e., persisted
`height`, updated on content-driven resize). No collaborative/concurrent-edit
concerns need to be handled — single-writer only. Once persisted, geometry
heuristics (placement, no-fly-zone clamping, paste bounding box) should read
this stored value instead of an estimate constant, falling back to an
estimate only for a card that hasn't rendered yet this session.

### 2.5 Edge endpoints

Today `fromId`/`toId` are untyped strings that could reference either a card
or a container. Whether to introduce a typed union
(`{ type: 'card' | 'container', id }`) — or whether a single unified `nodes`
collection makes the type discriminator unnecessary — is **deferred to
prototype-migration phase 2** (Q6). For v0 spec purposes, an edge connects
exactly two nodes (of any
kind) by id, at most one edge per unordered pair, each end anchored to one of
four sides (`top`/`right`/`bottom`/`left`) chosen once at creation and never
recomputed.

### 2.6 Images

Stored in a top-level map keyed by generated id (`images`), referenced by a
card via `imageId` — never inlined into the card itself. This ordering must
be preserved end-to-end (see §2.8): image blobs are large, unreadable-as-diff
base64, and are kept out of the otherwise-diffable node data. Orphaned image
entries (no card references them) are pruned after any mutation that could
leave one behind. No reference-counting/size-budget schema changes — this is
an accepted weakness of localStorage-based persistence, expected to improve
naturally once prototype-migration phase 2 moves to disk-backed storage (Q7).

### 2.7 Timestamps & schema version

- Every node and edge carries `createdAt`/`updatedAt` as ISO-8601 strings
  (not epoch ms), for diff-friendliness.
- `updatedAt` refreshes on *every* mutation to an existing entity, including
  a plain move with no content change. This is an intentional **(wart,
  keep)** per Q8 — recency mode's "fresh" reflects "touched at all," not
  "content changed."
- The v0 schema adds an explicit top-level `version` field (new — not present
  in the prototype), per Q15, so future format changes have something to
  branch on. Loading a document missing common fields (legacy prototype
  saves) should backfill sane defaults (see §9) rather than fail.

### 2.8 Serialization ordering

When serialized (autosave, JSON export/import), the `images` map must be the
last top-level key, so that a diff of the (much smaller, much more
meaningful) node/edge data isn't buried under base64 blobs.

## 3. Visual design

- **Color scheme:** Nord (light and dark variants). Palette:
  `gray` (nord3, plus a distinct lighter `GRAY_LIGHT` swatch used only in
  light mode), `coral` (nord11), `orange` (nord12), `amber` (nord13), `lime`
  (nord14), `teal` (nord7), `sky` (nord8), `violet` (nord15), `pink`
  (nord9 — Nord has no true pink, this is a deliberate substitution).
  - `gray` is the default color for freshly created cards/containers/edges
    and is deliberately low-contrast/neutral in both themes (its light-mode
    value is a distinct hex from its dark-mode value, unlike every other
    color, which uses the same hex in both themes).
  - A `gray` swatch renders as a half-light/half-dark split circle in color
    pickers, signaling "this one is theme-dynamic"; every other swatch is a
    plain fill.
- **Task-status colors** are a separate fixed 4-color palette, chosen for
  glyph contrast rather than subtlety: `todo` neutral (theme-dependent hex,
  higher contrast than default gray), `blocked` red (nord11), `in_progress`
  blue (nord10), `done` green (nord14).
- **Recency-mode colors** reuse 4 of the existing swatches (`lime`, `amber`,
  `orange`, `coral`) across 4 fixed thresholds — see §6.3.
- **Edges** are never user-colorable; always one fixed neutral tone (same hex
  as `gray`/nord3).
- **Font:** Fira Code Mono (Google Fonts), light weight everywhere except the
  `kanvy` wordmark in the top bar, which is bold. Lowercase wordmark.
- **Container backgrounds:** SVG patterns from the `hero-patterns` package
  (MIT-licensed), always rendered in the fixed neutral tone (never the
  container's own accent color) at a fixed opacity, tiled. Available
  patterns: none (plain), diagonal lines, graph paper, wiggle, plus,
  jupiter, topography, yyy, corkscrew. A container's accent color applies
  only to its border, never its background/pattern.
- **Grid:** a dot-matrix background at `GRID_SIZE = 16px` pitch. Card/edge
  geometry snaps to the *midpoints* between dots (offset by half a cell), so
  corners land in the gaps rather than on the dots themselves.
- Third-party dependencies (microlink.io, hero-patterns, Google Fonts CDN)
  are accepted as-is for v0, no vendoring/self-hosting or opt-out required
  (Q20).

## 4. Canvas & interaction model

### 4.1 Viewport

- Infinite pannable/zoomable canvas.
- Pan: right-click + drag, or two-finger scroll (trackpad) / mouse wheel
  scroll (non-zoom axis).
- Zoom: Ctrl/Cmd + scroll or trackpad pinch (reported as a wheel event with
  `ctrlKey` set), or the on-screen zoom in/out buttons (fixed step factor).
  Range roughly 25%–250%.
- Zoom-by-wheel keeps the point under the cursor visually fixed; zoom-by-
  button zooms around the viewport center.
- Clicking the zoom-percentage readout resets zoom to 100% (no keyboard
  shortcut for this — see §4.2's history for why).
- **Zoom to fit** (⌘/Ctrl+Shift+Enter): zooms out (never in past 100%) and
  centers so every card/container's combined bounding box is fully visible,
  with fixed world-space padding.

### 4.2 Keyboard shortcuts (current, authoritative set)

| Shortcut | Action |
|---|---|
| ⌘/Ctrl + click + drag | Create a container |
| Drag & drop an image file | Create an image card |
| Type a URL, then a space | Convert the card into a link card ("slurp") |
| ⌘/Ctrl + V (image on clipboard) | Paste into focused/selected card, or create a new image card |
| ⌘/Ctrl + V (link on clipboard) | Paste into focused/selected card, or create a new link card |
| ⌘/Ctrl + Shift + Enter | Zoom to fit everything in view |
| ⌘/Ctrl + N | New (empty) text card, centered, immediately focused for editing |
| ⌘/Ctrl + D | Duplicate selection, immediately focused for editing (single-card case) |
| ⌘/Ctrl + C | Copy selection (in-app clipboard; also copies concatenated text of selected cards to the system clipboard) |
| ⌘/Ctrl + V (nothing else matched) | In-app paste of previously copied selection, or system-clipboard plain text as a new card |
| ⌘/Ctrl + Z / ⌘/Ctrl + Shift+Z / Ctrl+Y | Undo / redo |
| Backspace / Delete | Delete selection (not while editing text) |
| Double-click canvas | Create a new text card at that point |
| Escape | Close the help panel |

Help panel: `?` button, bottom-left, opens a modal listing the shortcuts
above (a deliberately trimmed list — see dev-input.json 2026-09-11 18:56 —
excluding "obvious" whiteboard conventions like drag-to-move or click-to-
select). A prior "reset zoom via keyboard" shortcut (`z`/`Shift+Z`) was
removed after repeated platform conflicts (browser/extension shortcut
collisions) — **do not reintroduce a bare-key zoom-reset shortcut**; zoom
reset is click-only, by design, at least as an explicit prior decision to
respect.

### 4.3 Selection

- Click a card/container/edge: select it (single).
- Shift+click or Ctrl/Cmd+click: toggle additive selection.
- Click-drag on blank canvas (or inside a container's body, not its drag
  handle): marquee-select. A marquee that starts inside a container's body
  never selects that container or any container enclosing it (even if the
  marquee geometrically covers their bounds) — it only sweeps up cards and
  *other* containers actually overlapped. A marquee that starts outside any
  container behaves normally.
  - A drag-select initiated inside a container selects containers nested
    *within* it too, not just cards, if the drag geometrically covers them.
- A plain click (no movement) on a container's body selects that container.
- One selection menu for the whole selection (however mixed), anchored to
  the combined bounding box.
- Clicking an already-multi-selected card without a modifier preserves the
  multi-selection (so it can be dragged as a group) rather than collapsing
  to a single selection.

### 4.4 Dragging & snapping

- **X-axis:** snaps to the grid (see §3, midpoint offset).
- **Y-axis:** grid-snaps by default, same as X — but if a column-overlapping
  neighbor's top or bottom edge is within `Y_SNAP_THRESHOLD` (2 grid cells),
  its fixed gutter point (`Y_SNAP_GUTTER` = 1 grid cell from that edge)
  always wins over the grid snap, producing visually consistent spacing
  between cards of varying height regardless of grid alignment. The
  ~1-grid-height band around a neighbor's edge is effectively a "no drop
  zone": you can't land closer to it than the gutter, which is what guides
  drags into equidistant spacing. When several neighbors qualify,
  whichever neighbor's gutter is closest to the raw position wins, not
  just the first neighbor checked — an earlier revision returned on the
  first qualifying neighbor regardless of distance, which made a fast drag
  through a column of several cards appear to "stick" as it locked onto
  whichever neighbor came first instead of the nearest one.
- **Container no-fly zone:** a card can never end up straddling a
  container's top-edge drag-handle band (the handle itself, plus one grid
  cell of clearance above and below). It can still be placed fully inside
  the container (below the zone) or fully above the container (above the
  zone).
- Dragging a container carries everything completely within it (§2.3;
  merely straddling its edge doesn't count) and, when the container is
  part of a multi-selection, the rest of that
  selection too — merged so nothing double-moves.
- Dragging any node that's part of a multi-selection carries the whole
  selection, preserving relative positions.
- A container's body is not itself a drag surface — only its top handle bar
  drags it. This is deliberate: it lets a click-drag starting inside a
  container's body become a marquee-select over its contents instead.
- Resize: a container is resized by dragging its border/corner handles
  (8-way) at any time, not gated on selection; a heading-sized text card
  (h1/h2/h3) gets the same 8-way handles. Both snap size to the grid with
  a documented minimum.

### 4.5 Containers

- Created via Ctrl/Cmd + click-drag on blank canvas (always wins over
  starting on top of an existing card/container).
- Always rendered beneath cards.
- Selectable, colorable (border only), patternable (background), and can be
  a task (see §6).

### 4.6 Connections (edges)

- Drawn by dragging from a connector affordance that appears on hover
  (around any of the 4 sides of a card or container) to another node.
- Hovering/dropping anywhere in the general area of a side (not just the
  small connector dot) picks that side — generous hit area.
- At most one edge between any given pair of nodes; attempting to draw a
  second is a no-op (existing edge is selected instead of duplicated).
- Either side is independently assignable by the user; the app never
  recomputes a stored side after creation — a "wrong-looking" bend is
  intentional if the user picked it.
- Direction is one of `none` (plain line, default), `forward` (arrow toward
  `to`), `backward` (arrow toward `from`) — set/changed after creation via
  the edge's own selection menu.
- Path is a cubic bezier that always leaves/arrives perpendicular to the
  chosen side(s) before bending, with a small pseudo-random (id-hashed, so
  stable) perpendicular bow for organic variety — not user-controllable.
- Edges are always the fixed neutral color, rendered with a halo so they
  stay legible over a patterned container background.

## 5. Card kinds — details

### 5.1 Text — regular

- Created via double-click on canvas, ⌘/Ctrl+N, or typing/pasting plain text
  with nothing selected.
- Fixed width (`CARD_WIDTH`, a multiple of grid size). Height grows with
  content — no internal scroll, ever.
- Not rich text.

### 5.2 Text — headings (h1/h2/h3)

- A `size` variant of a text card, not a separate kind (per current
  implementation and Q2's discriminated-union framing) — three levels
  (`h1`/`h2`/`h3`), matching the familiar HTML-heading size progression
  (`h1` largest, `h3` smallest). `h1` is the migrated name for what an
  earlier revision called `'big'` (a single heading size) — legacy boards
  are backfilled (`schema/legacy.ts`).
- All three levels share identical mechanics, differing only in rendered
  font size:
  - User-resizable in any direction (8-way handles), independent of
    content length; same minimum and default box across all three levels.
  - Truncates (does not scroll) when content overflows; wraps if room
    allows.
- Toggle between regular/h1/h2/h3 via the selection menu. Switching
  between two heading levels (e.g. h1 → h2) only relabels the size — a
  user-resized box is preserved, not reset. Switching to `image` or `link`
  always forces `size` back to `regular` (drops the heading sizing
  entirely); switching *from* regular *to* a heading level seeds a fixed
  default box (a regular card's dimensions aren't meaningful free-resize
  ones).
- Can connect to other nodes via edges, same as any card.

### 5.3 Image

- Created by: dropping an image file onto blank canvas/container body, or
  pasting an image (clipboard or drag) with nothing/a container selected
  (new card), or with a non-image, non-link card focused/selected (converts
  that card in place, preserving its text and color).
- Downsized client-side (canvas re-encode) to a max long-edge dimension
  before storage as a base64 data URI (see §2.6 for storage shape).
- Fixed card width; height derived from the image's intrinsic aspect
  ratio — but never upscaled past its natural size. An image narrower
  than the card's fixed width is centered at its natural size (with
  breathing room above/below) rather than stretched to fill the card,
  since upscaling it would look pixelated. This is an intentional
  correction of the prototype, which did stretch small images to fill
  the card (see `ctx/notes/260917-remove-visual-regression-tier.md`).
- Caption textarea hidden when empty and the card isn't selected; visible
  (with placeholder) once selected, or whenever it has text.
- Never has a heading size (`h1`/`h2`/`h3`).
- Typing/pasting plain text into an image card's caption never triggers link
  "slurping" — always stays literal text.
- Pasting an image into an image or link card's caption does nothing.

### 5.4 Link

- Created by: pasting a URL (and nothing else — see `isPlainUrl`) with
  nothing/a container selected, with a non-image, non-link card
  focused/selected (converts in place), or by "slurping" a URL typed into a
  regular or heading-sized text card's content.
- **Slurp trigger:** a URL is removed from the text and the card converts to
  a link card (a) the moment a space/newline is typed immediately after it
  while live-typing, or (b) on blur, if it's the last thing in the text
  (nothing typed after it yet). Only the *first* URL in the text is ever
  slurped; any subsequent URL is left as plain text.
- Fetches title + preview image from a link-metadata service (currently
  microlink.io) asynchronously; card shows `linkStatus`: `loading` → `ready`
  (title/image populated, either may still be absent) or `error`.
  - **v0 improvement (per Q18):** add a timeout and basic retry to this
    fetch — today a failure is permanent with no retry. Exact retry
    count/backoff is an implementation detail, not user-facing.
- Displays title only (never the raw URL) once resolved; only the title text
  (with an external-link icon, underlined on hover) is actually clickable to
  navigate — the preview image behaves like an image card's image
  (draggable, click-to-select/edit).
- Never has a heading size (`h1`/`h2`/`h3`); mutually exclusive with `image`.
- Limit of one link per card — a second URL typed into the same text is left
  as plain text, not slurped.

## 6. Task layer & view modes

### 6.1 Task status

- Any card or container can optionally be a task. Toggled via the
  selection-menu's Default/Task section; independent of node kind.
- Once a task, it has exactly one of four statuses: `todo` (default on
  first becoming a task), `blocked`, `in_progress`, `done`. Changed only via
  the selection menu's status section (never by clicking the status glyph
  directly).
- Toggling "Default" → "Task" on an already-task item is idempotent — it
  never resets an existing status back to `todo`.
- A small non-interactive status glyph renders in the card/container's drag
  bar, colored per §3's task-status palette.
- `done` gets additional styling: caption text struck through and dimmed;
  any image (own or link preview) rendered monochrome with a theme-tinted
  overlay (lighten toward the theme's ink color, not plain grayscale) rather
  than plain black-and-white.

### 6.2 View modes

Selected from a menu (eye icon) in the top bar; persisted across sessions.

- **Standard** (default): dimming limited to `done` items; colors are each
  node's own selected accent color.
- **Task:** every non-task node is dimmed (dimmed text/image treatment, and
  its border/pattern goes to the neutral default color). Every task node's
  border shows its task-status color instead of its own accent color
  (louder signal than the glyph alone). Container backgrounds/patterns are
  suppressed entirely in this mode (plain neutral only), so the border's
  status color isn't competing with a pattern. `done` nodes remain dimmed
  even though they're tasks.
- **Recency:** every card/container's border color is derived from
  `updatedAt` instead of its own accent color, ignoring task status
  entirely. Four gradations, most-recent to stalest — **(wart, keep, per
  Q8–Q9)**:
  - ≤ 1 day: `lime`
  - ≤ 1 week: `amber`
  - ≤ 1 month: `orange`
  - older: `coral`
  These thresholds are fixed constants for v0, not user-configurable (Q9).
  Recency reflects "touched at all" (any mutation, including a bare move),
  not "content changed" — an accepted wart, not something to fix now (Q8).
  This view must visibly update over time even with no user interaction
  (i.e., re-evaluate periodically while active), since it's a function of
  wall-clock time, not just board data.
  - While recency mode is active, each card/container's drag bar also shows
    a small, non-interactive relative-time label ("3h ago", "2d ago", "3w
    ago") derived from the same `updatedAt`, at the opposite end of the bar
    from the task-status glyph. Hovering it surfaces the full timestamp via
    the browser's native `title` tooltip. Purely a labeling convenience
    alongside the border-color bands above — not part of the color logic,
    and re-evaluated on the same periodic tick.

## 7. Clipboard & copy/paste

Two independent, coexisting paste paths:

1. **In-app node clipboard** (cards/containers as structured data, in-memory
   only — not synced to the OS clipboard). Populated by ⌘/Ctrl+C on a
   selection; consumed by ⌘/Ctrl+V when nothing needs system-clipboard
   handling first (see priority order below). Edges between copied nodes are
   **not** currently carried over on copy/paste — preserve this limitation.
   - Each repeated paste of the same copy offsets further (a staircase),
     matching repeated duplicate behavior.
   - A paste never gets adopted by an *existing* container it happens to
     land on or near — group membership is purely spatial (§2.3), and that
     unintended result is explicitly avoided by pushing the paste position
     out along the staircase diagonal until clear of every existing
     container's bounds. This is about *existing* containers only, though:
     if a container was copied together with its own spatially-contained
     child, the paste preserves that relationship between the two pasted
     copies automatically — one uniform offset is applied to the whole
     copied set (not a per-node recompute), so their relative positions,
     and so their spatial containment, survive with fresh ids and no
     explicit relationship-tracking needed.
   - If the paste lands outside the current viewport, the view pans (without
     changing zoom) to bring it fully into view.
2. **System clipboard integration**, layered on top of #1:
   - Copying a selection also writes the concatenated caption text of every
     selected *card* (containers excluded) to the OS clipboard, newline-
     separated — but only if there's non-empty text to write (never
     overwrites the OS clipboard with nothing).
   - Pasting with nothing selected and an image on the OS clipboard: creates
     a new image card at the viewport center.
   - Pasting with a card focused/selected (and not itself an image or link)
     and an image on the OS clipboard: converts that card to an image card
     in place.
   - Pasting an image into an existing image or link card's caption: no-op.
   - Same pattern for a URL on the OS clipboard, targeting `link` conversion
     instead — with the same image/link mutual-exclusion no-ops.
   - Pasting plain text with nothing selected and no card focused: creates a
     new text card from it, centered in the viewport, stripped of any rich
     formatting.
   - Native paste inside an actively-focused textarea (editing a card's own
     caption) is left to the browser's own text-paste behavior, not
     intercepted.
   - Reading is done via the native `paste` event's `clipboardData`, never
     via `navigator.clipboard.readText()` called programmatically — the
     latter triggers an OS-level "Allow Paste?" confirmation dialog on some
     platforms (observed on macOS Safari) that reads as an unwanted extra
     step. **Preserve this approach in the rewrite.**

Priority order when ⌘/Ctrl+V fires (highest first): image on OS clipboard →
URL-only text on OS clipboard → (if something's selected) in-app node
clipboard → (else) plain OS-clipboard text as a new card.

## 8. Undo / redo

- Every mutating action goes through one shared history stack.
- Rapid-fire updates within a 400ms window (e.g. every pointermove of one
  drag) coalesce into a single undo step; a longer pause starts a new step.
  **(kept as-is per Q10 — a documented, not reconsidered, constant.)**
- History depth: 100 steps. **(kept as-is per Q10.)**
- These two constants should move somewhere configurable/visible in the
  rewrite (not hardcoded deep in a hook), but their values are unchanged.
- Importing a JSON file goes through the same history path as any other
  mutation — an accidental import is one undo away from being reverted, not
  a separate irreversible reset.
- **v0 correctness fix (per Q11):** selection state should be restored by
  undo/redo where it's unambiguous to do so — specifically, undoing a delete
  should re-select the restored items. This is a small, non-feature
  correctness fix to undo behavior, not a new capability.

## 9. Persistence & error handling

Current behavior is extremely permissive/silent; this migration explicitly
improves error handling (per the migration prompt) with the following
concrete decisions (Q12–Q15):

- **Schema version:** the board JSON carries an explicit `version` field
  from v0 onward (new).
- **Corrupt/unreadable saved data (Q12):** if the persisted board can't be
  parsed/validated, the app must:
  (a) still fall back to a usable board (the seed/starter board),
  (b) visibly tell the user recovery happened (not a silent fallback), and
  (c) not autosave over the unreadable data until the user acknowledges the
  situation — i.e., the original bytes must not be clobbered by the next
  autosave before the user has had a chance to know something was wrong.
  This is expected to be revisited when prototype-migration phase 2 moves to JSON-on-disk + REST
  persistence.
- **Storage-quota exceeded on autosave (Q13):** out of scope for v0 — no
  first-class error state required; acceptable to silently fail as today
  until prototype-migration phase 2 removes the size ceiling. (Don't regress below today's
  behavior, but don't invest here either.)
- **JSON import failure (Q14):** replace the current `window.alert` with a
  proper UI element (modal/toast) carrying the same level of generic
  messaging ("could not import — is this a Kanvy export?"); **do not** build
  structured field-level validation reporting for v0 — that's deferred.
- **Legacy/pre-version documents:** loading a document without a `version`
  field (or missing other now-required fields, e.g. timestamps) must
  normalize/backfill rather than fail, matching today's forgiving
  `normalizeBoard`/timestamp-backfill behavior — this leniency is a feature
  to keep, not a wart.

## 10. Third-party integrations

Accepted as-is for v0, no additional disclosure/opt-out/vendoring required
(Q20):

- **microlink.io** — every pasted/typed URL that becomes (or is checked to
  become) a link card is sent to this third-party API to fetch title/preview
  image. No backend proxy of our own.
- **hero-patterns** (MIT) — bundled as a dependency, not vendored/forked.
- **Google Fonts** — Fira Code Mono loaded from Google's CDN, not
  self-hosted.

## 11. Accessibility target (v0)

Tier (a) — baseline hygiene only (per Q19): semantic roles/labels where
applicable, visible focus states, sufficient color contrast, alt text where
images are meaningful, respect `prefers-reduced-motion`. Full keyboard
operability of canvas interactions (create/move/resize/connect without a
mouse) and genuine screen-reader usability of the spatial canvas are
explicitly **not** v0 goals — log as future work, do not attempt now, and do
not let it silently expand scope during implementation.

## 12. Platform target (v0)

Desktop-first, "true so far because nobody's tried it on mobile," not a
permanent constraint (Q21). v0 should add basic mobile/touch support (the
app should not be totally unusable on a touch device) but this is
explicitly **low priority** — the primary user is desktop-only. Do not let
touch-interaction-model work expand into a parallel feature effort; a
reasonable-effort pass is sufficient (e.g., touch-drag working for basic
move/select), not full parity with the mouse/trackpad interaction model
described in §4.

## 13. Testing priorities (informs, does not replace, prototype-migration phase 3 framework choice)

Per Q16–Q18:

- **e2e (real browser, real pointer events)** is the primary layer for
  canvas/pointer-driven behavior: drag-to-move, drag-to-resize, drag-to-
  select, drag-to-create-a-container, drag-to-connect, all snap-to
  behaviors, container no-fly zones, nested-container drag semantics.
- **Unit tests** cover pure functions in isolation: grid/snap math, geometry
  (anchor points, side selection, curve generation), URL-slurp detection,
  color/pattern resolution, task-status resolution.
- **Component tests** are not a required distinct tier for v0 — add them
  only where the marginal benefit over e2e/unit clearly justifies it, not as
  a blanket policy.
- **Clipboard/paste:** mock the Clipboard/paste APIs in tests (not real
  browser permission grants) — favor determinism over full integration
  fidelity; some real-world clipboard-permission quirks (see §7) may need to
  be caught by manual/exploratory testing instead.
- **Link metadata (microlink.io):** always mocked/stubbed in tests, never a
  live network dependency. The retry/timeout behavior added per §5.4 should
  itself be testable via the mock (e.g. simulate a slow/failing response).

## 14. Explicitly deferred to later prototype-migration phases

- Final shape of the node/edge collections (single `nodes` array vs.
  separate `cards`/`containers`; typed edge-endpoint union) — prototype-migration phase 2.
- Multiboard support — prototype-migration phase 2.
- JSON-on-disk + REST backend — prototype-migration phase 2 (design only), implementation later.
- JSON Canvas spec alignment/inspiration — prototype-migration phase 2.
- Image storage size/reference-counting budget — revisit once disk-backed.
- Structured import-validation error reporting — revisit post-v0.
- Storage-quota-exceeded first-class error UI — revisit post-v0
  (prototype-migration phase 2 persistence change likely obviates it).
- Full keyboard/screen-reader accessibility for the canvas — future work,
  not v0.
