export type ControlUpdate = {
  desiredHeadingDeg?: number
  spin?: 'full'
}

export interface Controller {
  start(): Promise<void>
  stop(): void
  updateLocalInput?(update: ControlUpdate): void
}

