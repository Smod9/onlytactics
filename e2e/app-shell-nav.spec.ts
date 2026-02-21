import { test, expect } from '@playwright/test'

test.describe('App shell hamburger menu navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/replay')
    await expect(page.locator('.app-shell')).toBeVisible()
  })

  test('hamburger button opens menu dropdown', async ({ page }) => {
    const burger = page.locator('.header-hamburger')
    await expect(burger).toBeVisible()

    await burger.click()
    await expect(page.locator('.header-menu-dropdown')).toBeVisible()
  })

  test('menu has Leaderboard item that navigates', async ({ page }) => {
    await page.locator('.header-hamburger').click()
    const item = page.locator('.header-menu-item:has-text("Leaderboard")')
    await expect(item).toBeVisible()

    await item.click()
    await page.waitForURL('**/leaderboard')
    await expect(page.locator('h2')).toContainText('Leaderboard')
  })

  test('menu has Replays item that navigates', async ({ page }) => {
    await page.locator('.header-hamburger').click()
    const item = page.locator('.header-menu-item:has-text("Replays")')
    await expect(item).toBeVisible()

    await item.click()
    await page.waitForURL('**/replay')
    await expect(page.locator('.app-shell')).toBeVisible()
  })

  test('menu has Regattas item that navigates', async ({ page }) => {
    await page.locator('.header-hamburger').click()
    const item = page.locator('.header-menu-item:has-text("Regattas")')
    await expect(item).toBeVisible()

    await item.click()
    await page.waitForURL('**/regattas')
    await expect(page.locator('.stats-page')).toBeVisible()
  })

  test('menu has Create Account for unauthenticated users', async ({ page }) => {
    await page.locator('.header-hamburger').click()
    const item = page.locator('.header-menu-item:has-text("Create Account")')
    await expect(item).toBeVisible()

    await item.click()
    await page.waitForURL('**/register')
    await expect(page.locator('h1')).toContainText('Create Account')
  })

  test('menu has theme toggle with Light/Dark/Auto options', async ({ page }) => {
    await page.locator('.header-hamburger').click()
    const themeGroup = page.locator('.theme-toggle')
    await expect(themeGroup).toBeVisible()

    await expect(page.locator('.theme-toggle-option:has-text("Light")')).toBeVisible()
    await expect(page.locator('.theme-toggle-option:has-text("Dark")')).toBeVisible()
    await expect(page.locator('.theme-toggle-option:has-text("Auto")')).toBeVisible()
  })

  test('clicking theme option does not crash', async ({ page }) => {
    await page.locator('.header-hamburger').click()
    const lightBtn = page.locator('.theme-toggle-option:has-text("Light")')
    await lightBtn.click()

    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('header brand link points to landing page', async ({ page }) => {
    const brand = page.locator('.brand a[href="/"]')
    await expect(brand).toBeVisible()
    await expect(brand).toContainText('Only Tactics')
  })

  test('header displays user label', async ({ page }) => {
    await expect(page.locator('.header-user-label')).toContainText('Guest')
  })

  test('menu does not show Profile or Lobby for unauthenticated users', async ({ page }) => {
    await page.locator('.header-hamburger').click()
    const dropdown = page.locator('.header-menu-dropdown')
    await expect(dropdown).toBeVisible()

    await expect(dropdown.locator('.header-menu-item:has-text("Profile")')).toHaveCount(0)
    await expect(dropdown.locator('.header-menu-item:has-text("Admin")')).toHaveCount(0)
  })
})
