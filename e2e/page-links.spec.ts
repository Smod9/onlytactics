import { test, expect } from '@playwright/test'

test.describe('In-page navigation links', () => {
  test('leaderboard page has Lobby link', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()

    const lobbyLink = page.locator('.stats-nav a[href="/lobby"]')
    await expect(lobbyLink).toBeVisible()
    await expect(lobbyLink).toContainText('Lobby')
  })

  test('leaderboard page has Replays link', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()

    const replayLink = page.locator('.stats-nav a[href="/replay"]')
    await expect(replayLink).toBeVisible()
    await expect(replayLink).toContainText('Replays')
  })

  test('leaderboard Lobby link navigates to auth gate', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()

    const lobbyLink = page.locator('.stats-nav a[href="/lobby"]')
    await lobbyLink.click()

    await page.waitForURL('**/lobby')
    await expect(page.locator('.auth-page')).toBeVisible()
  })

  test('leaderboard Replays link navigates to replay', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()

    const replayLink = page.locator('.stats-nav a[href="/replay"]')
    await replayLink.click()

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
