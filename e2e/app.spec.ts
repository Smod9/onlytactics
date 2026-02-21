import { test, expect } from '@playwright/test'

test.describe('App', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Only Tactics|Sailing/i)
  })

  test('game app route loads', async ({ page }) => {
    await page.goto('/app')
    await expect(page.locator('body')).toBeVisible()
  })
})
