import { Schema, type } from '@colyseus/schema'

export class RaceRoomState extends Schema {
  @type('string')
  status = 'initializing'

  @type('number')
  playerCount = 0

  setReady() {
    this.status = 'ready'
  }
}

