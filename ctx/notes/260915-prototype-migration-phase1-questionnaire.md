# prototype-migration phase 1 questionnaire — kanvy migration

## Method

Reviewed, in full:

- **Source 1** — `ctx/support/260915-prototype-claude-convos/dev-input.json` (all 135
  developer-typed messages across 4 sessions, 2026-09-09 → 2026-09-11)
- **Source 2** — `ctx/support/260915-dev-kanvy-natural-language-description.md`
- **Source 3** — `ctx/support/260915-prototype-source/` (all components, state hooks,
  utils, and the data model in `src/data/board.js` and `src/data/patterns.js`)

Sources 1–3 are detailed and mostly self-consistent — the source code in particular is
heavily comment-annotated with the *why* behind non-obvious behavior, which resolved a
lot of what would otherwise be open questions. What's below is what's left: places
where the three sources disagree, where behavior is clearly intentional but its
boundaries for a v0 spec aren't, or where a decision belongs to you rather than being
inferable from what exists (naming, scope, resilience posture, target platforms).

Grouped by theme. 21 questions.

---

## A. Naming & taxonomy

You flagged this yourself in the migration prompt — it seemed like the right place to
start.

**1. "Group" naming.** The prompt asks whether "group"/"border" is the right name, and
whether groups are "nodes." In the current code, cards and groups are siblings in the
data model (`board.cards`, `board.groups`) — a group is *not* a card, has no `content`,
and can't be an edge endpoint... wait, it can (edges connect cards or groups). Do you
want a shared parent type (e.g. all three of card/group/edge are "entities" or "nodes,"
with card and group both being "nodes" and edge being distinct), or should group stay a
clearly separate concept from card? Any preference on the actual replacement term
(frame, container, region, area, board-within-a-board)?

- i am inclined to think of nodes and edges. we can have node type of card for
  text nodes and 'container' feels like a good nomenclature for what is now
  often considered a group. see elsewhere in this note for recs around adding
  formal parentage.

**2. Image/link as card sub-kinds vs. distinct types.** Right now `imageId` and
`linkUrl` are optional fields on a card, not a discriminated type — a card is
"standard," "big," "image," or "link" depending on which fields are populated, and
several are mutually exclusive by convention (enforced in `useBoard.js`, not by the
type system). For the TS rewrite, do you want these to become a real discriminated
union (`kind: 'text' | 'image' | 'link'` with `size: 'regular' | 'big'` only valid on
`'text'`), or is preserving today's "flat optional fields" shape intentional for some
reason (e.g. simpler diffs, simpler conversion logic)?

- this is a great thing to flag and somewhere where i want improvement. i would
  love to move toward more discriminated unions. your proposal is great

**3. "Task" vs "project."** Your message introducing the task layer says "virtually any
entity ... can be considered a task - or project." The implementation only ever uses
"task" (field name `taskStatus`, menu icon `list-todo`, etc.) — "project" never
appears. Was that just a synonym in passing, or should a group-that's-a-task actually
be labeled/treated as a "project" distinctly from a card-that's-a-task?

- there is no need for a "project" concept. that is implicit and between the
  user and how they want to use their primitives. stick to task

---

## B. Data model correctness

The migration prompt calls the data model "so foundational" that it's explicitly
in-scope for correctness fixes, even though behavior elsewhere should stay constant.
These are the places where I'd guess "current shape is a wart," but want it confirmed
before locking in a v0 schema.

**4. Regular-card height isn't stored.** A "regular" text card's height is never part
of the data model — it's derived from the DOM (content length) at render time via
`ResizeObserver`/`offsetHeight`. That's fine in a browser, but it means anything that
needs a card's geometry without rendering it (e.g. an e2e test asserting layout, a
future server-side export, or even just the paste/no-fly-zone placement heuristics,
which currently fall back to a hardcoded `NEW_CARD_HEIGHT_ESTIMATE = 90`) can't know it
precisely. Should the corrected v0 model store a measured height (updated on content
change) so geometry is always knowable from data alone, or is "derived at render time,
estimated everywhere else" an intentional simplification to keep?

- good quesiton. i think as long as the actual content was a "source of truth"
  and calculated height flowed one-way to the data model on change, and we were
  in a state where we didn't expect competition, persisting the height to the
  data model is fien with me

**5. Group nesting is purely spatial, no formal ownership.** Comments in `Board.jsx`
are explicit that this is deliberate: dragging a group carries along whatever it
visually overlaps at drag-start, "no formal ownership" — not a stored `parentId`/
`groupId` relationship. Multiple non-trivial pieces of behavior exist entirely to work
around this being spatial (containment tests, "no-fly zones," the paste-outside-any-
group rule, the deeply-nested-group multiselect fix). When you say the data model
should be "correct" — does that include *this*, i.e. should nesting become an explicit
relationship in the new schema (with the same effective UX preserved through
migration/derivation), or is spatial-only nesting the correct design you want kept,
with "correctness" here meaning something else (e.g. just card/group/edge/image
normalization, ID stability, timestamp handling)?

- i think its reasonble to make the update to formal ownership. i think what i
  want to preserve is a behavior where when something is dropped in such a way
  that it enters the overlap area of a group (maybe with prefernce to wherever
  it overlaps the most) it becomes a child of that group. i guess the main thing
  is i dont want any explicit UI around it or have the user think about it.

**6. Edge endpoints reference cards or groups by raw ID with no type discriminator.**
`edge.fromId`/`toId` are plain strings that could be a card id or a group id — nothing
in the shape says which, so resolving one means checking both `cards` and `groups`
arrays. Worth a typed union (`{ type: 'card', id } | { type: 'group', id }`) in the new
schema, or keep the untyped-string-that-happens-to-match-an-id approach?

- we can hash this out more in the "spec alignment phase", but i am curios about a
  single `nodes` group rather than separte cards and group nodes

**7. `images` map has no reference-counting or size accounting in the schema itself** —
orphan-pruning is a behavior implemented in `useBoard.js`, not a data model constraint.
Given localStorage has a hard size ceiling (typically ~5–10MB) and every image is a
full base64 blob, do you want the v0 schema/spec to account for that limit explicitly
(e.g. a documented image-count/size budget, or an explicit non-goal that today's
localStorage-only persistence is expected to break down at scale and that's acceptable
until the prototype-migration phase 2 JSON-on-disk backend), or should size concerns wait entirely for
prototype-migration phase 2?

- don't worry about this. its a known weakness of the localStorage appraoch and
  it will be less of a concern with JSON-on-disk

---

## C. Behavior confirmations (things that look intentional but are worth locking in)

**8. Recency mode's timestamp source.** `resolveRecencyColor` reads `updatedAt`, and
`updatedAt` is refreshed on *every* mutation, including a plain drag/move with no
content change (see `moveCard` in `useBoard.js`). So dragging a card to tidy up layout
turns it "fresh" (green) in recency mode even though nothing about its content changed.
Is that the intended meaning of "recency" (touched at all, for any reason), or should a
future version distinguish "moved" from "edited" for this purpose? (Flagging only —
this is a behavior/feature question that might be explicitly out of scope per "warts
and all," but recency semantics seemed worth confirming since it's new/recent
functionality, not inherited cruft.)

- leave existing functionatly; call it a wart. some of these decisions will make
  themselves clear over the long haul of using the app

**9. Recency thresholds are hardcoded** (1 day / 1 week / 1 month, falling through to
"stale" beyond that). Fine to keep as fixed constants for v0, or should these become
user-configurable at some point (even if not in v0)? Just want to know whether to note
it in the spec as a deliberately-fixed constant vs. a "settings" surface that doesn't
exist yet.

- a valid concern and one that I had myself, but not a concern for now. copy
  existing hardcoded values

**10. Undo/redo coalescing window (400ms) and history depth (100 steps)** are both
magic numbers in `useBoard.js`. Keep as-is (i.e. treat as correct, just needing to move
somewhere more visible/configurable in the new code), or are these actually untuned
guesses that deserve reconsideration during the rewrite?

- i think thats fine

**11. Selection state isn't part of the undo/redo history.** Undoing a delete restores
the deleted items but doesn't restore them to "selected." Intentional, or an oversight
worth fixing (not as a new feature, just as an undo-correctness question, since "what
undo restores" arguably falls under data/state correctness rather than "features")?

- might be worth fixing this tiny one since we have eyes on it and its kind of
  nuanced.

---

## D. Error handling & resilience

Called out explicitly in the migration prompt as an improvement area ("better UI for
errors," "better handling for e.g. incompatible data"). The current implementation is
extremely permissive/silent, which is worth surfacing concretely:

**12. Corrupt/unreadable localStorage silently falls back to the seed board** (a
`try/catch` around `JSON.parse` in `loadInitialBoard`, with no user-facing signal that
recovery happened, and — worse — the *next* autosave overwrites whatever was in
localStorage with the fresh seed board, permanently losing whatever was there). Should
the rewrite (a) still fall back automatically, but (b) tell the user it happened, and
(c) not silently overwrite the unreadable data until the user acknowledges? Or is
silent-recovery-into-a-fresh-board acceptable as long as it doesn't crash?

- i like a + b + c. this behavior will likely need to be revisited when we
  migrate to JSON-on-disk + REST

**13. `localStorage.setItem` in the autosave effect has no error handling at all** — if
the board's images push it over the browser's storage quota, `setItem` throws
synchronously and, since nothing catches it, that failure is silent to the user (the UI
looks fine, but the board is no longer actually persisting). Given "error handling" is
an explicit improvement area, should quota-exceeded be a first-class error state (e.g.
a visible banner: "board isn't saving — remove some images"), and is that important
enough to prioritize in the v0 spec, or acceptable to defer until prototype-migration phase 2's disk-backed
storage removes the ceiling entirely?

- i think we can defer

**14. JSON import failure is a `window.alert`.** Given "better UI for errors" is
explicitly called out, should the v0 spec define real validation for an imported file
(e.g. checking it has the expected top-level shape, reporting *what's* wrong rather
than a generic "is it a Kanvy export?"), or is a clearer modal/toast with the same
generic message sufficient for v0, with structured validation errors deferred?

- i think we can defer structured validation.

**15. No schema version field anywhere in the board JSON.** Given prototype-migration
phase 2 is about finalizing a v0 schema (and there will necessarily be a "pre-v0" shape
from this prototype to migrate away from), should the new schema carry an explicit
`version` field from day one, so future format changes have something to branch on for
backward-compat/migration logic? (This feels like a now decision even though schema
alignment itself is prototype-migration phase 2 — reasonable to note for the spec
regardless.)

- yeah i think versioning schema is wise

---

## E. Testing priorities

The prompt says the spec should inform the tests, and that testing is a top-line
improvement area, but doesn't say what "good coverage" means for this app specifically.

**16. Which interactions are must-cover for e2e vs. acceptable as component/unit-level
only?** This app's core value is almost entirely pointer-driven (drag-to-move,
drag-to-resize, drag-to-select, drag-to-draw-a-group, drag-to-connect, snap-to-grid/
gutter, group no-fly-zones). Given how much of the actual logic here is
geometry/interaction rather than pure data transforms, do you want e2e (real
browser, real pointer events) to be the primary test layer for canvas behavior, with
unit tests reserved for the pure functions (`geometry.js`, `board.js`, `link.js`), or
is there a different split you have in mind (e.g. heavier investment in component tests
with simulated pointer events instead of full e2e)?

- i think given the dependency on pointer interactions, leaning on e2e with unit
  tests on pure functions is a good approach. component tests are either lighter
  or maybe not needed as a specific category if you feel the benefit is marginal

**17. Clipboard/paste testing is inherently awkward** — real browsers gate
`navigator.clipboard` behind permissions, and the dev-input log shows you hit exactly
this kind of platform friction firsthand (the macOS paste-permission popup, Vimium
intercepting a shortcut, Cmd+N opening a new browser window). Should the test suite
mock the Clipboard/paste APIs entirely (fast, deterministic, but not testing the real
integration), drive them through a real browser context with clipboard permissions
pre-granted (e.g. Playwright's grantPermissions), or some mix depending on the test
tier?

- lets go with the former. i want to keep e2e tests somewhat light and
  appreciate determinism a lot. i'm ok if we have squash some bugs as they come
  up

**18. Link-metadata fetches hit a live third-party API (microlink.io) with no backend
of our own.** For tests, should link-metadata fetches always be mocked/stubbed (so
tests aren't flaky or dependent on a third party being up), and should the *app itself*
also gain some kind of local fallback/timeout behavior for when microlink.io is slow or
down (currently: `linkStatus: 'error'`, permanently, with no retry)?

- yeah lets add some fallback and timeout behavior. add some retry logic. and
  wrt tests, mock.

---

## F. Accessibility target

The prompt lists a11y as an improvement area but doesn't say how far. This app's core
interaction model (drag on an infinite pannable/zoomable canvas) is inherently
difficult for keyboard-only and screen-reader users — worth being explicit about
ambition level before it becomes an implicit unbounded scope-creep risk during the
rewrite.

**19. What's the actual a11y bar for v0?** Options roughly range from (a) baseline
hygiene — proper semantic roles/labels, visible focus states, sufficient color
contrast, alt text, respecting `prefers-reduced-motion` — up through (b) full keyboard
operability of canvas interactions (create/select/move/resize/connect without a mouse)
and (c) genuine screen-reader usability of a spatial canvas (which would likely need
new UI, not just fixes, and probably conflicts with "preserve functionality, warts and
all, no feature improvements"). Which tier is the v0 target, understanding that (b)/(c)
may need to be logged as explicit future work rather than attempted now?

- i am thinking a for now.

---

## G. Third-party dependencies & privacy

**20. microlink.io usage sends every pasted URL to a third-party service** (noted
directly in the source's own comments) with no opt-out. Is that acceptable to carry
forward as-is for v0 (matching "preserve behavior, warts and all"), or does it need a
disclosure/toggle given this is being rebuilt with more rigor generally? Relatedly:
`hero-patterns` (MIT-licensed) and Google Fonts (Fira Code Mono, loaded via CDN) are
also external dependencies with no vendoring today — keep loading fonts from Google's
CDN, or self-host for offline dev/test reliability?

- i am ok with these 3rd party dependencies

---

## H. Platform & environment

**21. Target browsers/devices for v0.** The prototype assumes: a mouse with a
right-click (canvas panning), trackpad pinch-to-zoom, `navigator.clipboard`, hover
states (connector dots only appear on hover), and no touch-specific interaction path at
all. Is desktop-only (no mobile/touch support) an explicit, permanent constraint for
this app, or just true-so-far-because-nobody's-tried? This matters for the TS/testing
rewrite since "does it need a touch interaction model" changes quite a bit of the event
handling in `Board.jsx`/`Card.jsx`/`Group.jsx` if the answer is ever "yes."

- true-so-far-because-nobody's-tried. lets add some basic support so that a
  mobile user isn't completely left in the lurch, but this is not a high
  priority and i am the primary user and expect to use almost exclusively desktop
