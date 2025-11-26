import type { BoatState, RaceState, Vec2 } from '@/types/race'
import {
  BoatStateSchema,
  RaceStateSchema,
  Vec2Schema,
} from './RaceSchemas'

const assignVec = (target: Vec2Schema, source: Vec2) => {
  target.x = source.x
  target.y = source.y
}

const upsertBoat = (target: BoatStateSchema, source: BoatState) => {
  target.id = source.id
  target.name = source.name
  target.color = source.color
  target.headingDeg = source.headingDeg
  target.desiredHeadingDeg = source.desiredHeadingDeg
  assignVec(target.pos, source.pos)
  target.speed = source.speed
  target.lap = source.lap ?? 0
  target.nextMarkIndex = source.nextMarkIndex ?? 0
  target.inMarkZone = source.inMarkZone ?? false
  target.finished = Boolean(source.finished)
  target.finishTime = source.finishTime ?? 0
  target.distanceToNextMark = source.distanceToNextMark ?? 0
  target.penalties = source.penalties ?? 0
  target.stallTimer = source.stallTimer ?? 0
  target.overEarly = Boolean(source.overEarly)
  target.fouled = Boolean(source.fouled)
  target.lastInputSeq = source.lastInputSeq ?? 0
  target.lastInputAppliedAt = source.lastInputAppliedAt ?? 0
  target.rightsSuspended = Boolean(source.rightsSuspended)
}

export const applyRaceStateToSchema = (target: RaceStateSchema, source: RaceState) => {
  target.t = source.t
  target.meta.raceId = source.meta.raceId
  target.meta.courseName = source.meta.courseName
  target.meta.createdAt = source.meta.createdAt
  target.meta.seed = source.meta.seed

  target.wind.directionDeg = source.wind.directionDeg
  target.wind.speed = source.wind.speed
  target.baselineWindDeg = source.baselineWindDeg
  target.phase = source.phase
  target.countdownArmed = source.countdownArmed
  target.clockStartMs = source.clockStartMs ?? -1
  target.hostId = source.hostId ?? ''
  target.lapsToFinish = source.lapsToFinish
  target.aiEnabled = source.aiEnabled

  assignVec(target.startLine.pin, source.startLine.pin)
  assignVec(target.startLine.committee, source.startLine.committee)
  assignVec(target.leewardGate.left, source.leewardGate.left)
  assignVec(target.leewardGate.right, source.leewardGate.right)

  target.marks.splice(0, target.marks.length)
  source.marks.forEach((mark) => {
    const markSchema = new Vec2Schema()
    assignVec(markSchema, mark)
    target.marks.push(markSchema)
  })

  const ids = new Set(Object.keys(source.boats))
  target.boats.forEach((_, key) => {
    if (!ids.has(key)) {
      target.boats.delete(key)
    }
  })

  Object.values(source.boats).forEach((boat) => {
    let schemaBoat = target.boats.get(boat.id)
    if (!schemaBoat) {
      schemaBoat = new BoatStateSchema()
      target.boats.set(boat.id, schemaBoat)
    }
    upsertBoat(schemaBoat, boat)
  })

  target.leaderboard.splice(0, target.leaderboard.length)
  source.leaderboard.forEach((boatId) => target.leaderboard.push(boatId))
}

