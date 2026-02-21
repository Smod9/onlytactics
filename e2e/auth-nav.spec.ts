import { test, expect } from '@playwright/test'

test.describe('Auth page cross-navigation', () => {
  test('login page -> register link', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Welcome Back')

    const registerLink = page.locator('a[href="/register"]')
    await expect(registerLink).toBeVisible()
    await registerLink.click()

    await expect(page.locator('h1')).toContainText('Create Account')
    expect(page.url()).toContain('/register')
  })

  test('login page -> forgot password link', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Welcome Back')

    const forgotLink = page.locator('a[href="/forgot-password"]')
    await expect(forgotLink).toBeVisible()
    await forgotLink.click()

    await expect(page.locator('h1')).toContainText('Reset Password')
    expect(page.url()).toContain('/forgot-password')
  })

  test('register page -> login link', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('h1')).toContainText('Create Account')

    const loginLink = page.locator('a[href="/login"]')
    await expect(loginLink).toBeVisible()
    await loginLink.click()

    await expect(page.locator('h1')).toContainText('Welcome Back')
    expect(page.url()).toContain('/login')
  })

  test('forgot password page -> back to login link', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.locator('h1')).toContainText('Reset Password')

    const backLink = page.locator('a[href="/login"]')
    await expect(backLink).toBeVisible()
    await backLink.click()

    await expect(page.locator('h1')).toContainText('Welcome Back')
    expect(page.url()).toContain('/login')
  })

  test('reset password (no token) -> request new link', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.locator('h1')).toContainText('Invalid Link')

    const reqLink = page.locator('a[href="/forgot-password"]')
    await expect(reqLink).toBeVisible()
    await reqLink.click()

    await expect(page.locator('h1')).toContainText('Reset Password')
    expect(page.url()).toContain('/forgot-password')
  })

  test('auth gate (lobby) has guest option', async ({ page }) => {
    await page.goto('/lobby')
    await expect(page.locator('.auth-page')).toBeVisible()

    const guestBtn = page.locator('.auth-gate-guest-sticker')
    await expect(guestBtn).toBeVisible()
    await expect(guestBtn).toContainText(/guest/i)
  })

  test('auth gate (lobby) has sign-in toggle', async ({ page }) => {
    await page.goto('/lobby')
    await expect(page.locator('.auth-page')).toBeVisible()

    const signInLink = page.locator('button:has-text("Sign in")')
    await expect(signInLink).toBeVisible()
    await signInLink.click()

    await expect(page.locator('h1')).toContainText('Welcome Back')
  })

  test('login page brand link navigates to lobby', async ({ page }) => {
    await page.goto('/login')
    const brand = page.locator('.auth-brand')
    await expect(brand).toBeVisible()
    await expect(brand).toHaveAttribute('href', '/lobby')
  })

  test('register page brand link navigates to lobby', async ({ page }) => {
    await page.goto('/register')
    const brand = page.locator('.auth-brand')
    await expect(brand).toBeVisible()
    await expect(brand).toHaveAttribute('href', '/lobby')
  })
})
