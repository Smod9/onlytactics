import { Schema, type } from '@colyseus/schema'
import { RaceStateSchema } from './schema/RaceSchemas'

export class RaceRoomState extends Schema {
  @type('string')
  status = 'initializing'

  @type('number')
  playerCount = 0

  @type(RaceStateSchema)
  race = new RaceStateSchema()

  setReady() {
    this.status = 'ready'
  }
}

