import { expect, test } from '@playwright/test'
import { diffScreenshots } from './diff'

const NEW_APP_URL = 'http://localhost:5173'
const PROTOTYPE_URL = 'http://localhost:5174'

// Proves the visual-regression harness (dual dev servers + pixelmatch
// diffing) works end-to-end: both servers are reachable and diffScreenshots
// runs without throwing. Loose maxDiffPixelRatio on purpose — there's no
// rendered board yet to meaningfully compare (phase 7 stages add real
// scenarios at real thresholds, per
// ctx/notes/260915-phase6-e2e-test-scenario-checklist.md).
test('new app boots alongside the live prototype reference server', async ({
  browser,
}) => {
  const newAppContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
  })
  const prototypeContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
  })
  try {
    const newAppPage = await newAppContext.newPage()
    const prototypePage = await prototypeContext.newPage()
    await newAppPage.goto(NEW_APP_URL)
    await prototypePage.goto(PROTOTYPE_URL)

    const [actual, expected] = await Promise.all([
      newAppPage.screenshot(),
      prototypePage.screenshot(),
    ])
    const result = diffScreenshots(actual, expected, { maxDiffPixelRatio: 1 })

    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
  } finally {
    await newAppContext.close()
    await prototypeContext.close()
  }
})
