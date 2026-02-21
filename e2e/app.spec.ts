import { test, expect } from '@playwright/test'

test.describe('App smoke tests', () => {
  test('page does not show uncaught error overlay', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Only Tactics')

    expect(errors.filter((e) => !e.includes('fetch'))).toHaveLength(0)
  })
})
