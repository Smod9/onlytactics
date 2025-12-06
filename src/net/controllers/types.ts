export type ControlUpdate = {
  desiredHeadingDeg?: number
  absoluteHeadingDeg?: number
  deltaHeadingDeg?: number
  spin?: 'full'
  vmgMode?: boolean
  clientSeq?: number
}

export interface Controller {
  start(): Promise<void>
  stop(): void
  updateLocalInput?(update: ControlUpdate): void
}

