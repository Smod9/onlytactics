import { Router } from 'express'
import { authenticate } from '../auth/authMiddleware'
import {
  createRegatta,
  listRegattas,
  getRegattaDetail,
  updateRegatta,
  addRaceToRegatta,
  removeRaceFromRegatta,
  getNextRaceNumber,
} from '../db/regattaStorage'

const router = Router()

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, numRaces, throwoutCount } = req.body
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'bad_request', message: 'name is required' })
      return
    }
    const regatta = await createRegatta(
      name.trim(),
      typeof description === 'string' ? description.trim() : '',
      typeof numRaces === 'number' && numRaces >= 1 ? Math.floor(numRaces) : 3,
      typeof throwoutCount === 'number' && throwoutCount >= 0 ? Math.floor(throwoutCount) : 0,
      req.user?.sub ?? null,
    )
    res.status(201).json(regatta)
  } catch (error) {
    console.error('[api] failed to create regatta', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.get('/', async (_req, res) => {
  try {
    const regattas = await listRegattas()
    res.json(regattas)
  } catch (error) {
    console.error('[api] failed to list regattas', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id)
    const detail = await getRegattaDetail(id)
    if (!detail) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json(detail)
  } catch (error) {
    console.error('[api] failed to get regatta', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.patch('/:id', authenticate, async (req, res) => {
  try {
    const id = String(req.params.id)
    const { name, description, numRaces, throwoutCount } = req.body
    const fields: Record<string, unknown> = {}
    if (typeof name === 'string') fields.name = name.trim()
    if (typeof description === 'string') fields.description = description.trim()
    if (typeof numRaces === 'number' && numRaces >= 1) fields.numRaces = Math.floor(numRaces)
    if (typeof throwoutCount === 'number' && throwoutCount >= 0) fields.throwoutCount = Math.floor(throwoutCount)

    const updated = await updateRegatta(id, fields)
    if (!updated) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json(updated)
  } catch (error) {
    console.error('[api] failed to update regatta', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.post('/:id/races', authenticate, async (req, res) => {
  try {
    const id = String(req.params.id)
    const { raceId, raceNumber } = req.body
    if (typeof raceId !== 'string' || !raceId.trim()) {
      res.status(400).json({ error: 'bad_request', message: 'raceId is required' })
      return
    }
    const num = typeof raceNumber === 'number' ? raceNumber : await getNextRaceNumber(id)
    await addRaceToRegatta(id, raceId.trim(), num)
    res.status(201).json({ regattaId: id, raceId: raceId.trim(), raceNumber: num })
  } catch (error) {
    console.error('[api] failed to add race to regatta', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.delete('/:id/races/:raceId', authenticate, async (req, res) => {
  try {
    const id = String(req.params.id)
    const raceId = String(req.params.raceId)
    await removeRaceFromRegatta(id, raceId)
    res.json({ success: true })
  } catch (error) {
    console.error('[api] failed to remove race from regatta', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
