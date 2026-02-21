import { test, expect } from '@playwright/test'

test.describe('Landing page navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Only Tactics')
  })

  test('"Launch the Game" CTA links to /lobby', async ({ page }) => {
    const cta = page.locator('a.cta')
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/lobby')
    await expect(cta).toContainText('Launch the Game')
  })

  test('GitHub link has correct href and opens in new tab', async ({ page }) => {
    const link = page.locator('a[aria-label="GitHub"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /github\.com/)
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('Discord link has correct href and opens in new tab', async ({ page }) => {
    const link = page.locator('a[aria-label="Discord"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /discord\.gg/)
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('WhatsApp link has correct href and opens in new tab', async ({ page }) => {
    const link = page.locator('a[aria-label="WhatsApp"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /chat\.whatsapp\.com/)
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('Buy Me a Coffee link has correct href and opens in new tab', async ({ page }) => {
    const link = page.locator('a[aria-label="Buy Me a Coffee"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /buymeacoffee\.com/)
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('testimonials section renders', async ({ page }) => {
    await expect(page.locator('.testimonials')).toBeVisible()
    const testimonials = page.locator('.testimonial')
    await expect(testimonials).toHaveCount(5)
  })

  test('landing footer renders', async ({ page }) => {
    await expect(page.locator('.landing-footer')).toBeVisible()
  })
})
