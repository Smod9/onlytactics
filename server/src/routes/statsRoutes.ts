import { Router } from 'express'
import { getLeaderboard, getUserStats, getUserRaceHistory } from '../db/statsStorage'

const router = Router()

router.get('/leaderboard', async (req, res) => {
  try {
    const minRaces = Number(req.query.minRaces) || 3
    const limit = Number(req.query.limit) || 50
    const entries = await getLeaderboard({ minRaces, limit })
    res.json(entries)
  } catch (error) {
    console.error('[api] failed to get leaderboard', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const stats = await getUserStats(userId)
    if (!stats) {
      res.status(404).json({ error: 'not_found', message: 'No stats for this user' })
      return
    }
    res.json(stats)
  } catch (error) {
    console.error('[api] failed to get user stats', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.get('/users/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 20
    const history = await getUserRaceHistory(userId, { page, limit })
    res.json(history)
  } catch (error) {
    console.error('[api] failed to get user race history', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
