import Phaser from 'phaser'
import type { BoatState, RaceState, Vec2 } from '@/types/race'
import { BoatSprite } from './BoatSprite'

const IS_DEV = import.meta.env.DEV ?? false

export class GameScene extends Phaser.Scene {
  private latestState?: RaceState
  private water?: Phaser.GameObjects.Rectangle
  private courseLayer?: Phaser.GameObjects.Graphics
  private mapScale = 1
  private readonly mapScaleBase = 560
  private boatSprites = new Map<string, BoatSprite>()
  private boatGroup?: Phaser.Physics.Arcade.Group
  private markGroup?: Phaser.Physics.Arcade.StaticGroup
  private debugLabel?: Phaser.GameObjects.Text
  private receivedFirstState = false

  constructor() {
    super({ key: 'RaceScene' })
  }

  preload() {
    const graphics = this.add.graphics()
    graphics.fillStyle(0xffffff, 1)
    graphics.fillTriangle(0, 40, 20, 0, 40, 40)
    graphics.generateTexture('__boat_placeholder', 40, 40)
    graphics.clear()
    graphics.fillStyle(0xffc300, 1)
    graphics.fillCircle(16, 16, 16)
    graphics.generateTexture('__mark_placeholder', 32, 32)
    graphics.destroy()
  }

  create() {
    if (IS_DEV) {
      console.debug('[phaser] create called')
    }
    this.cameras.main.setBackgroundColor('#020615')
    this.water = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x021428).setOrigin(0)
    this.courseLayer = this.add.graphics().setDepth(1)
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height)
    this.boatGroup = this.physics.add.group({ runChildUpdate: true })
    this.markGroup = this.physics.add.staticGroup()
    if (this.boatGroup) {
      this.physics.add.collider(this.boatGroup, this.boatGroup, undefined, undefined, this)
    }
    if (this.boatGroup && this.markGroup) {
      this.physics.add.collider(this.boatGroup, this.markGroup, undefined, undefined, this)
    }
    this.handleResize()
    this.scale.on('resize', () => this.handleResize())
    this.debugLabel = this.add
      .text(12, 12, 'Waiting for state…', {
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '11px',
        color: '#8fd5ff',
      })
      .setDepth(50)
      .setScrollFactor(0)
  }

  update() {}

  setRaceState(state: RaceState) {
    this.latestState = state
    if (IS_DEV) {
      console.debug('[phaser] applying state', state.phase, state.t)
    }
    if (!this.receivedFirstState && IS_DEV) {
      console.debug('[phaser] received first race state', {
        t: state.t,
        phase: state.phase,
        boats: Object.keys(state.boats).length,
        marks: state.marks.length,
      })
      this.receivedFirstState = true
    }
    this.drawCourse(state)
    this.updateMarkBodies(state)
    this.syncBoatSprites(state)
    this.updateDebugLabel(state)
  }

  getRaceState() {
    return this.latestState
  }

  private handleResize() {
    const { width, height } = this.scale.gameSize
    this.mapScale = Math.min(width, height) / this.mapScaleBase
    this.water?.setSize(width, height)
    this.physics.world.setBounds(0, 0, width, height)
    if (this.latestState) {
      this.drawCourse(this.latestState)
      this.updateMarkBodies(this.latestState)
      this.syncBoatSprites(this.latestState)
    }
  }

  private drawCourse(state: RaceState) {
    if (IS_DEV) {
      console.debug('[phaser] drawCourse', state.marks.length)
    }
    if (!this.courseLayer) return
    const map = (vec: Vec2) => this.mapToScreen(vec)
    this.courseLayer.clear()
    this.courseLayer.fillStyle(0x021428).fillRect(0, 0, this.scale.width, this.scale.height)
    this.drawMarks(state, map)
    this.drawStartLine(state, map)
    this.drawLeewardGate(state, map)
  }

  private drawMarks(state: RaceState, map: (vec: Vec2) => { x: number; y: number }) {
    if (!this.courseLayer) return
    state.marks.forEach((mark, index) => {
      const { x, y } = map(mark)
      this.courseLayer.fillStyle(0xffe066, 0.9)
      this.courseLayer.fillCircle(x, y, 8)
      this.courseLayer.lineStyle(1, 0xffffff, 0.4)
      this.courseLayer.strokeCircle(x, y, 14 + index * 1.5)
    })
  }

  private drawStartLine(state: RaceState, map: (vec: Vec2) => { x: number; y: number }) {
    if (!this.courseLayer) return
    const pin = map(state.startLine.pin)
    const committee = map(state.startLine.committee)
    this.courseLayer.lineStyle(2, 0xffffff, 0.85)
    this.courseLayer.beginPath()
    this.courseLayer.moveTo(pin.x, pin.y)
    this.courseLayer.lineTo(committee.x, committee.y)
    this.courseLayer.closePath()
    this.courseLayer.strokePath()
    this.courseLayer.fillStyle(0xffd166).fillCircle(pin.x, pin.y, 9)
    this.courseLayer.fillStyle(0x5cc8ff)
    this.courseLayer.fillCircle(committee.x, committee.y, 9)
  }

  private drawLeewardGate(state: RaceState, map: (vec: Vec2) => { x: number; y: number }) {
    if (!this.courseLayer) return
    const left = map(state.leewardGate.left)
    const right = map(state.leewardGate.right)
    this.courseLayer.lineStyle(2, 0xff6b6b, 0.9)
    this.courseLayer.beginPath()
    this.courseLayer.moveTo(left.x, left.y)
    this.courseLayer.lineTo(right.x, right.y)
    this.courseLayer.strokePath()
    this.courseLayer.fillStyle(0xff6b6b, 0.95)
    this.courseLayer.fillCircle(left.x, left.y, 8)
    this.courseLayer.fillCircle(right.x, right.y, 8)
  }

  private syncBoatSprites(state: RaceState) {
    const seen = new Set<string>()
    Object.values(state.boats).forEach((boat) => {
      const sprite = this.getOrCreateBoat(boat)
      const screen = this.mapToScreen(boat.pos)
      sprite.setServerSnapshot({
        x: screen.x,
        y: screen.y,
        headingDeg: boat.headingDeg,
        speedPixelsPerSecond: boat.speed * this.mapScale,
        color: boat.color ?? 0xffffff,
      })
      seen.add(boat.id)
    })

    this.boatSprites.forEach((sprite, id) => {
      if (!seen.has(id)) {
        this.boatGroup?.remove(sprite, false, false)
        sprite.destroy()
        this.boatSprites.delete(id)
        if (IS_DEV) {
          console.debug('[phaser] removed boat sprite', id)
        }
      }
    })
  }

  private getOrCreateBoat(boat: BoatState) {
    let sprite = this.boatSprites.get(boat.id)
    if (!sprite) {
      const initialPos = this.mapToScreen(boat.pos)
      sprite = new BoatSprite(this, initialPos.x, initialPos.y, boat.color ?? 0xffffff)
      this.boatGroup?.add(sprite)
      this.boatSprites.set(boat.id, sprite)
      if (IS_DEV) {
        console.debug('[phaser] created boat sprite', { boatId: boat.id, name: boat.name })
      }
    }
    return sprite
  }

  private updateMarkBodies(state: RaceState) {
    if (!this.markGroup) return
    this.markGroup.clear(true, true)
    const collisionMarks: Vec2[] = [
      ...state.marks,
      state.startLine.pin,
      state.startLine.committee,
      state.leewardGate.left,
      state.leewardGate.right,
    ]
    collisionMarks.forEach((mark) => {
      const pos = this.mapToScreen(mark)
      const image = this.markGroup!.create(pos.x, pos.y, '__mark_placeholder') as Phaser.Physics.Arcade.Image
      image.setVisible(false)
      image.setDisplaySize(32, 32)
      image.refreshBody()
    })
    if (IS_DEV) {
      console.debug('[phaser] updated mark colliders', collisionMarks.length)
    }
  }

  private updateDebugLabel(state: RaceState) {
    if (!this.debugLabel) return
    const boatCount = Object.keys(state.boats).length
    const finished = state.leaderboard.slice(0, 3).map((id) => state.boats[id]?.name ?? '').filter(Boolean)
    this.debugLabel.text = [
      `t=${state.t.toFixed(1)}s phase=${state.phase}`,
      `boats=${boatCount} marks=${state.marks.length}`,
      finished.length ? `leaders: ${finished.join(', ')}` : 'leaders: —',
    ].join('\n')
  }
  private mapToScreen(vec: Vec2) {
    const { width, height } = this.scale.gameSize
    return {
      x: width / 2 + vec.x * this.mapScale,
      y: height / 2 + vec.y * this.mapScale,
    }
  }
}

