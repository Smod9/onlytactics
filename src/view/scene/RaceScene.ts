import { Application, Container, Graphics, Text } from 'pixi.js'
import type { BoatState, RaceState, Vec2 } from '@/types/race'

const degToRad = (deg: number) => (deg * Math.PI) / 180

type ScreenMapper = (value: Vec2) => { x: number; y: number }

class BoatView {
  container = new Container()
  hull = new Graphics()
  sail = new Graphics()
  projection = new Graphics()
  nameTag = new Text({
    text: '',
    style: {
      fill: '#ffffff',
      fontSize: 12,
      align: 'center',
    },
  })

  constructor(private color: number) {
    this.drawBoat()
    this.container.addChild(this.projection, this.hull, this.sail, this.nameTag)
    this.nameTag.position.set(-20, 18)
  }

  private drawBoat() {
    this.hull.clear()
    this.hull.fill({ color: this.color })
    this.hull.poly([
      0,
      -20,
      10,
      10,
      0,
      16,
      -10,
      10,
    ])
    this.hull.fill()

    this.sail.clear()
    this.sail.fill({ color: 0xffffff, alpha: 0.8 })
    this.sail.poly([
      0,
      -18,
      6,
      4,
      0,
      8,
    ])
    this.sail.fill()
  }

  update(boat: BoatState, mapToScreen: ScreenMapper, scale: number) {
    const { x, y } = mapToScreen(boat.pos)
    this.container.position.set(x, y)
    this.container.scale.set(scale)
    this.container.rotation = degToRad(boat.headingDeg)
    this.nameTag.text = `${boat.name} (${boat.penalties})`
    if (boat.overEarly || boat.fouled) {
      this.nameTag.style.fill = '#ff6b6b'
    } else {
      this.nameTag.style.fill = '#ffffff'
    }
    this.drawProjection(boat, scale)
  }

  private drawProjection(boat: BoatState, scale: number) {
    this.projection.clear()
    const length = Math.max(40, boat.speed * 6) / Math.max(scale, 0.0001)
    this.projection
      .setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.3 })
      .moveTo(0, -10)
      .lineTo(0, -10 - length)
      .stroke()
  }
}

export class RaceScene {
  private waterLayer = new Graphics()
  private courseLayer = new Graphics()
  private boatLayer = new Container()
  private hudLayer = new Container()
  private windArrow = new Graphics()
  private windArrowFill = new Graphics()
  private windText = new Text({
    text: '',
    style: { fill: '#ffffff', fontSize: 12 },
  })
  private timerText = new Text({
    text: '',
    style: { fill: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  })

  private boats = new Map<string, BoatView>()

  constructor(private app: Application) {
    this.app.stage.addChild(
      this.waterLayer,
      this.courseLayer,
      this.boatLayer,
      this.hudLayer,
    )

    this.hudLayer.addChild(this.windArrow, this.windArrowFill, this.windText, this.timerText)
    this.windText.position.set(80, 20)
    this.timerText.position.set(20, 20)
    this.windText.position.set(20, 48)

    this.drawWater()
  }

  update(state: RaceState) {
    this.drawCourse(state)
    this.drawBoats(state)
    this.drawHud(state)
  }

  resize() {
    this.drawWater()
  }

  private drawWater() {
    const { width, height } = this.app.canvas
    this.waterLayer.clear()
    this.waterLayer.clear()
    this.waterLayer.fill({ color: 0x021428 })
    this.waterLayer.rect(0, 0, width, height)
    this.waterLayer.fill()
  }

  private mapToScreen(): ScreenMapper {
    const { width, height } = this.app.canvas
    const scale = Math.min(width, height) / 800
    return (value: Vec2) => ({
      x: width / 2 + value.x * scale,
      y: height / 2 + value.y * scale,
    })
  }

  private drawCourse(state: RaceState) {
    const map = this.mapToScreen()
    this.courseLayer.clear()
    this.drawStartLine(state, map)
    this.drawMarks(state, map)
    this.drawLeewardGate(state, map)
  }

  private drawMarks(state: RaceState, map: ScreenMapper) {
    this.courseLayer.setStrokeStyle({ width: 2, color: 0x5174b3, alpha: 0.6 })
    state.marks.forEach((mark, index) => {
      const { x, y } = map(mark)
      this.courseLayer.fill({ color: 0xffff00, alpha: 0.8 })
      this.courseLayer.circle(x, y, 6)
      this.courseLayer.fill()
      this.courseLayer.setStrokeStyle({ width: 1, color: 0xffffff })
      this.courseLayer.moveTo(x + 10, y - 10)
      this.courseLayer.lineTo(x + 10 + index * 4, y - 10)
    })
  }

  private drawStartLine(state: RaceState, map: ScreenMapper) {
    const pin = map(state.startLine.pin)
    const committee = map(state.startLine.committee)
    const dashed = state.t < 0

    this.courseLayer.setStrokeStyle({ width: 2, color: 0xffffff, alpha: dashed ? 0.4 : 0.9 })
    if (dashed) {
      this.drawDashedLine(pin, committee, 12, 8)
    } else {
      this.courseLayer.moveTo(pin.x, pin.y)
      this.courseLayer.lineTo(committee.x, committee.y)
      this.courseLayer.stroke()
    }

    // Pin mark
    this.courseLayer.fill({ color: 0xffd166, alpha: 0.9 })
    this.courseLayer.circle(pin.x, pin.y, 8)
    this.courseLayer.fill()

    // Committee boat shape
    const angle = Math.atan2(pin.y - committee.y, pin.x - committee.x)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const hull = [
      { x: 0, y: -14 },
      { x: 18, y: 12 },
      { x: -18, y: 12 },
    ].map(({ x, y }) => ({
      x: committee.x + x * cos - y * sin,
      y: committee.y + x * sin + y * cos,
    }))

    this.courseLayer.fill({ color: 0x5cc8ff, alpha: 0.95 })
    this.courseLayer.poly([
      hull[0].x,
      hull[0].y,
      hull[1].x,
      hull[1].y,
      hull[2].x,
      hull[2].y,
    ])
    this.courseLayer.fill()
  }

  private drawDashedLine(
    start: { x: number; y: number },
    end: { x: number; y: number },
    dashLength: number,
    gapLength: number,
  ) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    const segments = Math.floor(length / (dashLength + gapLength))
    const unitX = dx / length
    const unitY = dy / length
    let dist = 0
    for (let i = 0; i <= segments; i += 1) {
      const dashStartDist = dist
      const dashEndDist = Math.min(dist + dashLength, length)
      const from = {
        x: start.x + unitX * dashStartDist,
        y: start.y + unitY * dashStartDist,
      }
      const to = {
        x: start.x + unitX * dashEndDist,
        y: start.y + unitY * dashEndDist,
      }
      this.courseLayer.moveTo(from.x, from.y)
      this.courseLayer.lineTo(to.x, to.y)
      dist += dashLength + gapLength
    }
    this.courseLayer.stroke()
  }

  private drawLeewardGate(state: RaceState, map: ScreenMapper) {
    const left = map(state.leewardGate.left)
    const right = map(state.leewardGate.right)
    this.courseLayer.setStrokeStyle({ width: 2, color: 0xff6b6b, alpha: 0.8 })
    this.courseLayer.moveTo(left.x, left.y)
    this.courseLayer.lineTo(right.x, right.y)
    ;[left, right].forEach((gateMark) => {
      this.courseLayer.fill({ color: 0xff6b6b, alpha: 0.9 })
      this.courseLayer.circle(gateMark.x, gateMark.y, 7)
      this.courseLayer.fill()
    })
  }

  private drawBoats(state: RaceState) {
    const map = this.mapToScreen()
    const { width, height } = this.app.canvas
    const scale = Math.min(width, height) / 1200
    const seen = new Set<string>()
    Object.values(state.boats).forEach((boat) => {
      seen.add(boat.id)
      if (!this.boats.has(boat.id)) {
        const view = new BoatView(boat.color)
        this.boats.set(boat.id, view)
        this.boatLayer.addChild(view.container)
      }
      this.boats.get(boat.id)?.update(boat, map, scale)
    })

    // cleanup
    this.boats.forEach((view, id) => {
      if (seen.has(id)) return
      this.boatLayer.removeChild(view.container)
      this.boats.delete(id)
    })
  }

  private drawHud(state: RaceState) {
    this.timerText.text = `${state.phase.toUpperCase()} | T = ${state.t.toFixed(0)}s`
    const shift = state.wind.directionDeg - state.baselineWindDeg
    const shiftText =
      Math.abs(shift) < 0.5 ? 'ON' : shift > 0 ? `${shift.toFixed(1)}° R` : `${shift.toFixed(1)}° L`
    this.windText.text = `Wind ${state.wind.directionDeg.toFixed(0)}° (${shiftText}) @ ${state.wind.speed.toFixed(1)}kts`

    const center = { x: 80, y: 120 }
    const length = 60
    const heading = degToRad(state.wind.directionDeg + 180)
    const tipX = center.x + length * Math.sin(heading)
    const tipY = center.y - length * Math.cos(heading)

    const arrowShift = state.wind.directionDeg - state.baselineWindDeg
    const shiftColor = arrowShift > 1 ? 0xff8f70 : arrowShift < -1 ? 0x70d6ff : 0xffffff

    this.windArrow.clear()
    this.windArrow.setStrokeStyle({ width: 3, color: shiftColor })
    this.windArrow.moveTo(center.x, center.y)
    this.windArrow.lineTo(tipX, tipY)
    this.windArrow.stroke()

    this.windArrowFill.clear()
    this.windArrowFill.fill({ color: shiftColor })
    this.windArrowFill.poly([
      tipX,
      tipY,
      tipX + 8,
      tipY - 12,
      tipX - 8,
      tipY - 12,
    ])
    this.windArrowFill.fill()
  }
}

