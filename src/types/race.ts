export type Vec2 = { x: number; y: number }

export type Wind = {
  directionDeg: number
  speed: number
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
  lap: number
  nextMarkIndex: number
  inMarkZone: boolean
  finished: boolean
  finishTime?: number
  distanceToNextMark?: number
  penalties: number
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
  boats: Record<string, BoatState>
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

export type RaceRole = 'host' | 'player' | 'spectator'

