import { test, expect } from '@playwright/test'

test.describe('In-page navigation links', () => {
  test('leaderboard page has header menu with Lobby', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()

    await page.locator('.header-hamburger').click()
    const lobbyItem = page.locator('.header-menu-item', { hasText: 'Lobby' })
    await expect(lobbyItem).toBeVisible()
  })

  test('leaderboard page has header menu with Replays', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()

    await page.locator('.header-hamburger').click()
    const replayItem = page.locator('.header-menu-item', { hasText: 'Replays' })
    await expect(replayItem).toBeVisible()
  })

  test('leaderboard Lobby menu item navigates to auth gate', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()

    await page.locator('.header-hamburger').click()
    const lobbyItem = page.locator('.header-menu-item', { hasText: 'Lobby' })
    await lobbyItem.click()

    await page.waitForURL('**/lobby')
    await expect(page.locator('.auth-page')).toBeVisible()
  })

  test('leaderboard Replays menu item navigates to replay', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()

    await page.locator('.header-hamburger').click()
    const replayItem = page.locator('.header-menu-item', { hasText: 'Replays' })
    await replayItem.click()

    await page.waitForURL('**/replay')
    await expect(page.locator('.app-shell')).toBeVisible()
  })

  test('landing CTA navigates to auth gate', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Only Tactics')

    const cta = page.locator('a.cta')
    await cta.click()

    await page.waitForURL('**/lobby')
    await expect(page.locator('.auth-page')).toBeVisible()
  })
})
