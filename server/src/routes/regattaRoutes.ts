import { Router } from 'express'
import { authenticate } from '../auth/authMiddleware'
import {
  createRegatta,
  listRegattas,
  getRegattaDetail,
  updateRegatta,
  deleteRegatta,
  getRegattaOwner,
  addRaceToRegatta,
  removeRaceFromRegatta,
  getNextRaceNumber,
  type RegattaStatus,
} from '../db/regattaStorage'
import type { Request, Response } from 'express'

const VALID_STATUSES: RegattaStatus[] = ['active', 'completed', 'cancelled']

const isCreatorOrAdmin = async (req: Request, res: Response, regattaId: string): Promise<boolean> => {
  const owner = await getRegattaOwner(regattaId)
  if (!owner) {
    res.status(404).json({ error: 'not_found' })
    return false
  }
  const isOwner = req.user?.sub != null && owner.createdBy === req.user.sub
  const isAdmin = req.user?.role === 'admin'
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: 'forbidden', message: 'Only the creator or an admin can modify this regatta' })
    return false
  }
  return true
}

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

router.get('/', async (req, res) => {
  try {
    const statusParam = req.query.status as string | undefined
    const statusFilter = statusParam && VALID_STATUSES.includes(statusParam as RegattaStatus)
      ? (statusParam as RegattaStatus)
      : undefined
    const regattas = await listRegattas(statusFilter)
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
    if (!(await isCreatorOrAdmin(req, res, id))) return

    const { name, description, numRaces, throwoutCount, status } = req.body
    const fields: Record<string, unknown> = {}
    if (typeof name === 'string') fields.name = name.trim()
    if (typeof description === 'string') fields.description = description.trim()
    if (typeof numRaces === 'number' && numRaces >= 1) fields.numRaces = Math.floor(numRaces)
    if (typeof throwoutCount === 'number' && throwoutCount >= 0) fields.throwoutCount = Math.floor(throwoutCount)
    if (typeof status === 'string' && VALID_STATUSES.includes(status as RegattaStatus)) fields.status = status

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

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = String(req.params.id)
    if (!(await isCreatorOrAdmin(req, res, id))) return

    const deleted = await deleteRegatta(id)
    if (!deleted) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ success: true })
  } catch (error) {
    console.error('[api] failed to delete regatta', error)
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
    if (!(await isCreatorOrAdmin(req, res, id))) return

    const raceId = String(req.params.raceId)
    await removeRaceFromRegatta(id, raceId)
    res.json({ success: true })
  } catch (error) {
    console.error('[api] failed to remove race from regatta', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
