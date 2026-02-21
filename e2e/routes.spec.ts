import { test, expect } from '@playwright/test'

test.describe('Route loading - every route renders without crashing', () => {
  test('/ - landing page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Only Tactics')
  })

  test('/login - login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Welcome Back')
    await expect(page.locator('.auth-form')).toBeVisible()
  })

  test('/register - register page', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('h1')).toContainText('Create Account')
    await expect(page.locator('.auth-form')).toBeVisible()
  })

  test('/forgot-password - forgot password page', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.locator('h1')).toContainText('Reset Password')
    await expect(page.locator('.auth-form')).toBeVisible()
  })

  test('/reset-password - reset password page (no token)', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.locator('h1')).toContainText('Invalid Link')
    await expect(page.locator('.auth-card')).toBeVisible()
  })

  test('/leaderboard - leaderboard page', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('h2')).toContainText('Leaderboard')
    await expect(page.locator('.stats-page')).toBeVisible()
  })

  test('/regattas - regattas page', async ({ page }) => {
    await page.goto('/regattas')
    await expect(page.locator('.stats-page')).toBeVisible()
  })

  test('/replay - replay page loads app shell', async ({ page }) => {
    await page.goto('/replay')
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.locator('.app-header')).toBeVisible()
  })

  test('/lobby - shows auth gate for unauthenticated users', async ({ page }) => {
    await page.goto('/lobby')
    await expect(page.locator('.auth-page')).toBeVisible()
    await expect(page.locator('h1')).toContainText(/Join the Race|Welcome Back/)
  })

  test('/app - shows auth gate for unauthenticated users', async ({ page }) => {
    await page.goto('/app')
    await expect(page.locator('.auth-page')).toBeVisible()
    await expect(page.locator('h1')).toContainText(/Join the Race|Welcome Back/)
  })

  test('/profile - renders for unauthenticated users', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.locator('.stats-page')).toBeVisible()
  })

  test('/admin - redirects unauthenticated users away', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForFunction(() => window.location.pathname !== '/admin', null, { timeout: 10_000 })
  })

  test('unknown route - does not crash', async ({ page }) => {
    await page.goto('/nonexistent-page')
    await expect(page.locator('body')).toBeVisible()
  })
})
