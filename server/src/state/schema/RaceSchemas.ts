import {
  ArraySchema,
  MapSchema,
  Schema,
  type,
} from '@colyseus/schema'

export class Vec2Schema extends Schema {
  @type('number')
  x = 0

  @type('number')
  y = 0
}

export class WindSchema extends Schema {
  @type('number')
  directionDeg = 0

  @type('number')
  speed = 0
}

export class RaceMetaSchema extends Schema {
  @type('string')
  raceId = ''

  @type('string')
  courseName = 'Practice Course'

  @type('number')
  createdAt = 0

  @type('number')
  seed = 0
}

export class StartLineSchema extends Schema {
  @type(Vec2Schema)
  pin = new Vec2Schema()

  @type(Vec2Schema)
  committee = new Vec2Schema()
}

export class GateSchema extends Schema {
  @type(Vec2Schema)
  left = new Vec2Schema()

  @type(Vec2Schema)
  right = new Vec2Schema()
}

export class BoatStateSchema extends Schema {
  @type('string')
  id = ''

  @type('string')
  name = ''

  @type('number')
  color = 0

  @type(Vec2Schema)
  pos = new Vec2Schema()

  @type('number')
  headingDeg = 0

  @type('number')
  desiredHeadingDeg = 0

  @type('number')
  speed = 0

  @type('number')
  lap = 0

  @type('number')
  nextMarkIndex = 0

  @type('boolean')
  inMarkZone = false

  @type('boolean')
  finished = false

  @type('number')
  finishTime = 0

  @type('number')
  distanceToNextMark = 0

  @type('number')
  penalties = 0

  @type('number')
  stallTimer = 0

  @type('boolean')
  overEarly = false

  @type('boolean')
  fouled = false

  @type('number')
  lastInputSeq = 0

  @type('number')
  lastInputAppliedAt = 0

  @type('boolean')
  rightsSuspended = false
}

export class RaceStateSchema extends Schema {
  @type('number')
  t = 0

  @type(RaceMetaSchema)
  meta = new RaceMetaSchema()

  @type(WindSchema)
  wind = new WindSchema()

  @type('number')
  baselineWindDeg = 0

  @type({ map: BoatStateSchema })
  boats = new MapSchema<BoatStateSchema>()

  @type([Vec2Schema])
  marks = new ArraySchema<Vec2Schema>()

  @type(StartLineSchema)
  startLine = new StartLineSchema()

  @type(GateSchema)
  leewardGate = new GateSchema()

  @type('string')
  phase: 'prestart' | 'running' | 'finished' = 'prestart'

  @type('boolean')
  countdownArmed = false

  @type('number')
  clockStartMs = -1

  @type('string')
  hostId = ''

  @type('number')
  lapsToFinish = 3

  @type(['string'])
  leaderboard = new ArraySchema<string>()

  @type('boolean')
  aiEnabled = true
}

export type {
  ArraySchema,
  MapSchema,
}

