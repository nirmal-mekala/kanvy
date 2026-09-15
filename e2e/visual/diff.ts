import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface VisualDiffOptions {
  /** Pixelmatch's YIQ perceptual-distance tolerance per pixel (phase 3 tooling §3 default: 0.2). */
  threshold?: number
  /** Fraction of pixels allowed to differ before the comparison fails (phase 3 tooling §3 default: 0.01). */
  maxDiffPixelRatio?: number
}

export interface VisualDiffResult {
  width: number
  height: number
  diffPixelCount: number
  diffPixelRatio: number
  diffImage: Buffer
  passed: boolean
}

/**
 * Diffs two screenshot buffers (e.g. from `page.screenshot()`) directly
 * with pixelmatch, rather than Playwright's baseline-file assertion —
 * there's no static baseline here, the "baseline" is the live original
 * prototype (phase 3 tooling §3).
 */
export function diffScreenshots(
  actual: Buffer,
  expected: Buffer,
  options: VisualDiffOptions = {},
): VisualDiffResult {
  const threshold = options.threshold ?? 0.2
  const maxDiffPixelRatio = options.maxDiffPixelRatio ?? 0.01

  const a = PNG.sync.read(actual)
  const b = PNG.sync.read(expected)
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `screenshot size mismatch: actual ${a.width}x${a.height} vs expected ${b.width}x${b.height}`,
    )
  }

  const diff = new PNG({ width: a.width, height: a.height })
  const diffPixelCount = pixelmatch(
    a.data,
    b.data,
    diff.data,
    a.width,
    a.height,
    { threshold },
  )
  const diffPixelRatio = diffPixelCount / (a.width * a.height)

  return {
    width: a.width,
    height: a.height,
    diffPixelCount,
    diffPixelRatio,
    diffImage: PNG.sync.write(diff),
    passed: diffPixelRatio <= maxDiffPixelRatio,
  }
}
