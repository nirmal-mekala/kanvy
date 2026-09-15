import { expect, test } from '@playwright/test'

// Proves the interaction-e2e harness itself runs against the (currently
// bare) app shell. Full interaction coverage (drag/select/connect/etc.)
// is written stage-by-stage in phase 7, using this harness — see
// ctx/notes/260915-phase6-e2e-test-scenario-checklist.md.
test('app boots and renders its root element', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#root')).toBeVisible()
})
