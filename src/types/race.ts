export type Vec2 = { x: number; y: number }

export type Wind = {
  directionDeg: number
  speed: number
}

export type WindFieldConfig = {
  enabled: boolean
  /** Typical peak delta (kts) of puffs/lulls before clamping. */
  intensityKts: number
  /** Number of moving puff/lull blobs in the domain. */
  count: number
  /** Typical blob size in world units (roughly half-width). */
  sizeWorld: number
  /** Along-wind wrapping length in world units. */
  domainLengthWorld: number
  /** Cross-wind extent (centered) in world units. */
  domainWidthWorld: number
  /** Multiplier for downwind advection speed relative to wind speed. */
  advectionFactor: number
  /** Visual tile size (world units) for square patch rendering. */
  tileSizeWorld: number
}

export type StartLine = {
  pin: Vec2
  committee: Vec2
}

export type Gate = {
  left: Vec2
  right: Vec2
}

export type BoatAiConfig = {
  profileId: string
  accuracy: number
  reactionMs: number
  upwindAwa: number
  downwindAwa: number
  tackThresholdDeg: number
  gybeThresholdDeg: number
  laylineBuffer: number
  separationDistance?: number
  enabled: boolean
}

export type BoatState = {
  id: string
  name: string
  color: number
  pos: Vec2
  prevPos?: Vec2
  headingDeg: number
  desiredHeadingDeg: number
  speed: number
  wakeFactor?: number
  lap: number
  nextMarkIndex: number
  inMarkZone: boolean
  finished: boolean
  finishTime?: number
  distanceToNextMark?: number
  penalties: number
  protestPenalties: number  /** Portion of `penalties` that came specifically from an on-water protest. */
  stallTimer: number
  tackTimer: number
  overEarly: boolean
  fouled: boolean
  lastInputSeq?: number
  lastInputAppliedAt?: number
  rightsSuspended: boolean
  vmgMode?: boolean
  ai?: BoatAiConfig
}

export type RaceMeta = {
  raceId: string
  courseName: string
  createdAt: number
  seed: number
}

export type RacePhase = 'prestart' | 'running' | 'finished'

export type RaceState = {
  t: number
  meta: RaceMeta
  wind: Wind
  baselineWindDeg: number
  windField?: WindFieldConfig
  boats: Record<string, BoatState>
  /**
   * Active protests keyed by `protestedBoatId`.
   * We intentionally keep this 1:1 for now (only one protest per protested boat).
   */
  protests: Record<string, Protest>
  marks: Vec2[]
  startLine: StartLine
  leewardGate: Gate
  phase: RacePhase
  countdownArmed: boolean
  clockStartMs: number | null
  hostId?: string
  hostBoatId?: string
  lapsToFinish: number
  leaderboard: string[]
  aiEnabled: boolean
  /** Debug/admin feature: when true, the simulation is frozen (no stepping). */
  paused?: boolean
}

export type PlayerInput = {
  boatId: string
  tClient: number
  seq: number
  desiredHeadingDeg?: number
  absoluteHeadingDeg?: number
  deltaHeadingDeg?: number
  spin?: 'full'
  vmgMode?: boolean
  clearPenalty?: boolean
}

export type RuleId = '10' | '11' | '12' | '18' | '29' | 'other'

export type RaceEventKind =
  | 'start_signal'
  | 'penalty'
  | 'rule_hint'
  | 'general_recall'
  | 'finish'

export type RaceEvent = {
  eventId: string
  t: number
  kind: RaceEventKind
  ruleId?: RuleId
  boats?: string[]
  message: string
}

export type ChatSenderRole = 'host' | 'player' | 'spectator' | 'system'

export type ChatMessage = {
  messageId: string
  raceId: string
  senderId: string
  senderName: string
  senderRole: ChatSenderRole
  text: string
  ts: number
}

export type ReplayFrame = {
  t: number
  state: RaceState
  events: RaceEvent[]
}

export type ReplayRecording = {
  version: 1
  meta: RaceMeta
  frames: ReplayFrame[]
  chat: ChatMessage[]
}

export type RaceRole = 'host' | 'player' | 'spectator' | 'judge' | 'god'

export type ProtestStatus = 'active' | 'active_waived'

export type Protest = {
  protestedBoatId: string
  protestorBoatId: string
  /** Race-time (`t`) when the protest was filed. */
  createdAtT: number
  status: ProtestStatus
}

