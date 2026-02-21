import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('serverEnv', () => {
  beforeEach(() => {
    // Reset modules so we can test with different process.env
    vi.resetModules()
  })

  it('exports appEnv with expected shape', async () => {
    const { appEnv } = await import('./serverEnv')
    expect(appEnv).toHaveProperty('raceId')
    expect(appEnv).toHaveProperty('tickRateHz')
    expect(appEnv).toHaveProperty('countdownSeconds')
    expect(appEnv).toHaveProperty('databaseUrl')
    expect(appEnv).toHaveProperty('jwtSecret')
    expect(appEnv).toHaveProperty('smtpHost')
    expect(typeof appEnv.tickRateHz).toBe('number')
    expect(typeof appEnv.countdownSeconds).toBe('number')
  })

  it('uses default countdownSeconds when env not set', async () => {
    const orig = process.env.COUNTDOWN_SECONDS
    delete process.env.COUNTDOWN_SECONDS
    delete process.env.VITE_COUNTDOWN_SECONDS
    vi.resetModules()
    const { appEnv } = await import('./serverEnv')
    expect(appEnv.countdownSeconds).toBe(180)
    process.env.COUNTDOWN_SECONDS = orig
  })
})
