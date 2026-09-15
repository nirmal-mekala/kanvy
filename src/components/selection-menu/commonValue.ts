// Small pure helper the selection menu uses throughout (spec §3/§5.2/§6.1):
// a mixed selection shows a control as "active" only when every selected
// item agrees on the value, matching the prototype's
// `new Set(...).size === 1 ? [...set][0] : null` pattern at each call site.

export function commonValue<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null
  const [first, ...rest] = values
  return rest.every((value) => value === first) ? (first as T) : null
}
