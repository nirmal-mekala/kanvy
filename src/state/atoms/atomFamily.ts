// Minimal cached-factory helper standing in for jotai/utils' `atomFamily`,
// which jotai v3 (installed, see package.json) split out into a separate
// `jotai-family` package — not one of the phase3-decided dependencies
// (AGENTS.md Stack). Rather than add a new dependency for this one
// utility, this reimplements just the part this codebase needs: a stable,
// memoized per-id atom lookup. It never evicts (no `.remove()`), which is
// fine here — board node/edge ids are stable for a session and boards are
// small, so an unbounded id->atom cache isn't a real memory concern.

export function atomFamily<Param, AtomType>(
  createAtom: (param: Param) => AtomType,
): (param: Param) => AtomType {
  const cache = new Map<Param, AtomType>()
  return (param: Param) => {
    const existing = cache.get(param)
    if (existing !== undefined) return existing
    const created = createAtom(param)
    cache.set(param, created)
    return created
  }
}
