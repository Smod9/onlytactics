import type { RaceState, Vec2 } from '@/types/race'
import { boatCapsuleCircles } from '@/logic/boatGeometry'
import {
  BOAT_BOW_OFFSET,
  BOAT_BOW_RADIUS,
  BOAT_STERN_OFFSET,
  BOAT_STERN_RADIUS,
  GATE_COLLIDER_RADIUS,
  MARK_COLLIDER_RADIUS,
} from '@/logic/constants'
import { courseLegs } from '@/config/course'

type CollisionResult = {
  correctedPositions: Map<string, Vec2>
  collidedBoatIds: Set<string>
}

type MarkCollider = {
  collider: unknown
  center: Vec2
  radius: number
}

let rapier: any | null = null
let rapierInit: Promise<void> | null = null
let world: any | null = null
let marksKey: string | null = null

const boatBodies = new Map<string, any>()
const boatColliders = new Map<string, Array<unknown>>()
let markColliders: MarkCollider[] = []

const gateMarkIndices = new Set<number>()
courseLegs.forEach((leg) => {
  if (leg.kind === 'gate' && leg.gateMarkIndices) {
    gateMarkIndices.add(leg.gateMarkIndices[0])
    gateMarkIndices.add(leg.gateMarkIndices[1])
  }
})

const degToRad = (deg: number) => (deg * Math.PI) / 180

const ensureRapier = () => {
  if (rapierInit) return
  rapierInit = import('@dimforge/rapier2d-compat')
    .then((mod) => {
      const resolved = (mod as any).default ?? mod
      return resolved.init().then(() => {
        rapier = resolved
      })
    })
    .catch((err) => {
      console.error('[rapier] failed to init', err)
    })
}

const buildMarksKey = (state: RaceState) =>
  state.marks.map((mark) => `${mark.x.toFixed(3)},${mark.y.toFixed(3)}`).join('|')

const rebuildWorld = (state: RaceState) => {
  if (!rapier) return
  world = new rapier.World({ x: 0, y: 0 })
  boatBodies.clear()
  boatColliders.clear()
  markColliders = []
  marksKey = buildMarksKey(state)

  state.marks.forEach((mark, index) => {
    const radius = gateMarkIndices.has(index) ? GATE_COLLIDER_RADIUS : MARK_COLLIDER_RADIUS
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(mark.x, mark.y),
    )
    const collider = world.createCollider(rapier.ColliderDesc.ball(radius), body)
    markColliders.push({ collider, center: { x: mark.x, y: mark.y }, radius })
  })
}

const pruneMissingBoats = (state: RaceState) => {
  if (!world) return
  const existingIds = new Set(Object.keys(state.boats))
  Array.from(boatBodies.keys()).forEach((boatId) => {
    if (existingIds.has(boatId)) return
    const body = boatBodies.get(boatId)
    if (body && typeof world.removeRigidBody === 'function') {
      world.removeRigidBody(body)
    }
    boatBodies.delete(boatId)
    boatColliders.delete(boatId)
  })
}

const ensureBoatBodies = (state: RaceState) => {
  if (!world || !rapier) return
  pruneMissingBoats(state)
  Object.values(state.boats).forEach((boat) => {
    let body = boatBodies.get(boat.id)
    let colliders = boatColliders.get(boat.id)
    if (!body) {
      body = world.createRigidBody(
        rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
          boat.pos.x,
          boat.pos.y,
        ),
      )
      const bow = world.createCollider(
        rapier.ColliderDesc.ball(BOAT_BOW_RADIUS).setTranslation(0, -BOAT_BOW_OFFSET),
        body,
      )
      const stern = world.createCollider(
        rapier.ColliderDesc.ball(BOAT_STERN_RADIUS).setTranslation(0, -BOAT_STERN_OFFSET),
        body,
      )
      colliders = [bow, stern]
      boatBodies.set(boat.id, body)
      boatColliders.set(boat.id, colliders)
    }

    const headingRad = degToRad(boat.headingDeg)
    if (typeof body.setNextKinematicTranslation === 'function') {
      body.setNextKinematicTranslation({ x: boat.pos.x, y: boat.pos.y })
    } else if (typeof body.setTranslation === 'function') {
      body.setTranslation({ x: boat.pos.x, y: boat.pos.y }, true)
    }
    if (typeof body.setNextKinematicRotation === 'function') {
      body.setNextKinematicRotation(headingRad)
    } else if (typeof body.setRotation === 'function') {
      body.setRotation(headingRad, true)
    }
  })
}

const colliderHandle = (collider: any) =>
  typeof collider?.handle === 'number' ? collider.handle : collider

const hasIntersection = (a: unknown, b: unknown) => {
  if (!world || typeof (world as any).intersectionPair !== 'function') return true
  try {
    return Boolean((world as any).intersectionPair(colliderHandle(a), colliderHandle(b)))
  } catch (err) {
    console.warn('[rapier] intersectionPair failed, falling back to overlap math', err)
    return true
  }
}

const addPush = (acc: Vec2, push: Vec2) => {
  acc.x += push.x
  acc.y += push.y
}

export const resolveBoatMarkCollisions = (state: RaceState): CollisionResult => {
  ensureRapier()
  if (!rapier) {
    return { correctedPositions: new Map(), collidedBoatIds: new Set() }
  }
  const nextKey = buildMarksKey(state)
  if (!world || marksKey !== nextKey) {
    rebuildWorld(state)
  }
  if (!world) return { correctedPositions: new Map(), collidedBoatIds: new Set() }

  ensureBoatBodies(state)
  if (typeof world.step === 'function') {
    world.step()
  }

  const correctedPositions = new Map<string, Vec2>()
  const collidedBoatIds = new Set<string>()

  Object.values(state.boats).forEach((boat) => {
    const circles = boatCapsuleCircles(boat)
    const colliders = boatColliders.get(boat.id) ?? []
    const totalPush = { x: 0, y: 0 }

    circles.forEach((circle, index) => {
      const collider = colliders[index]
      if (!collider) return
      markColliders.forEach((mark) => {
        if (!hasIntersection(collider, mark.collider)) return
        const dx = circle.x - mark.center.x
        const dy = circle.y - mark.center.y
        const minDist = circle.r + mark.radius
        const distSq = dx * dx + dy * dy
        if (distSq >= minDist * minDist) return
        const dist = Math.sqrt(distSq) || 0.0001
        const penetration = minDist - dist
        const nx = dx / dist
        const ny = dy / dist
        addPush(totalPush, { x: nx * penetration, y: ny * penetration })
        collidedBoatIds.add(boat.id)
      })
    })

    if (totalPush.x !== 0 || totalPush.y !== 0) {
      correctedPositions.set(boat.id, {
        x: boat.pos.x + totalPush.x,
        y: boat.pos.y + totalPush.y,
      })
    }
  })

  return { correctedPositions, collidedBoatIds }
}
