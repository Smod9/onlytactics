import { Application, Container, Graphics, Text } from 'pixi.js'
import { appEnv } from '@/config/env'
import type { BoatState, RaceState, Vec2 } from '@/types/race'
import { identity } from '@/net/identity'
import { angleDiff } from '@/logic/physics'
import {
  WAKE_CONE_HALF_ANGLE_DEG,
  WAKE_HALF_WIDTH_END,
  WAKE_HALF_WIDTH_START,
  WAKE_LENGTH,
  WAKE_MAX_SLOWDOWN,
} from '@/logic/constants'
import { raceStore } from '@/state/raceStore'
import { courseLegs, courseMarkAnnotations, radialSets, gateRadials } from '@/config/course'

const degToRad = (deg: number) => (deg * Math.PI) / 180
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const normalizeDeg = (deg: number) => {
  const wrapped = deg % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

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
    const hullPoints = [
      0,
      -20,
      10,
      10,
      0,
      16,
      -10,
      10,
    ]
    this.hull.poly(hullPoints)
    this.hull.fill()
    this.hull.setStrokeStyle({ width: 2, color: 0x00c389 })
    this.hull.moveTo(0, -20)
    this.hull.lineTo(10, 10)
    this.hull.stroke()
    this.hull.setStrokeStyle({ width: 2, color: 0xff5e5e })
    this.hull.moveTo(-10, 10)
    this.hull.lineTo(0, -20)
    this.hull.stroke()
    this.hull.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.25 })
    this.hull.moveTo(-10, 10)
    this.hull.lineTo(10, 10)
    this.hull.stroke()
    this.sail.position.set(0, -20)
    this.sail.pivot.set(0, 0)
    this.drawSailShape(1)
  }

  private drawSailShape(leewardSign: 1 | -1) {
    this.sail.clear()
    this.sail.fill({ color: 0xffffff, alpha: 0.4 })
    // Bow tack
    this.sail.moveTo(0, 0)

    // Clew (foot angle)
    this.sail.lineTo(leewardSign * 25, 38)

    // Smooth leech curve: control point halfway up, curved inwards
    this.sail.quadraticCurveTo(
      leewardSign * 32, 4,   // control point
      leewardSign * 10, 0    // head of the sail, slightly forward
    )

    this.sail.closePath()
    this.sail.fill()

  }

  update(boat: BoatState, mapToScreen: ScreenMapper, scale: number, isPlayer = false) {
    const { x, y } = mapToScreen(boat.pos)
    this.container.position.set(x, y)
    this.container.scale.set(scale)
    this.container.rotation = degToRad(boat.headingDeg)
    const awa = angleDiff(RaceScene.currentWindDeg, boat.headingDeg)
    const leewardSign: 1 | -1 = awa >= 0 ? -1 : 1
    this.drawSailShape(leewardSign)
    const apparent = Math.abs(angleDiff(boat.headingDeg, RaceScene.currentWindDeg))
    const trimFactor = Math.min(1, apparent / 140)
    const rotationDeg = leewardSign * (8 + trimFactor * 24)
    this.sail.rotation = degToRad(rotationDeg)
    this.nameTag.text = boat.penalties ? `${boat.name} (${boat.penalties})` : boat.name
    if (boat.overEarly || boat.fouled || boat.penalties > 0) {
      this.nameTag.style.fill = '#ff6b6b'
    } else {
      this.nameTag.style.fill = '#ffffff'
    }
    this.drawProjection(boat, scale, isPlayer)
  }

  private drawProjection(boat: BoatState, scale: number, isPlayer: boolean) {
    this.projection.clear()
    const baseLength = Math.max(40, boat.speed * 6)
    const length = (isPlayer ? baseLength * 4 : baseLength) / Math.max(scale, 0.0001)
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
  private overlayLayer = new Container()
  private boatLayer = new Container()
  private hudLayer = new Container()
  private windArrow = new Graphics()
  private windArrowFill = new Graphics()
  private windText = new Text({
    text: '',
    style: { fill: '#ffffff', fontSize: 16, fontWeight: '600' },
  })
  private timerText = new Text({
    text: '',
    style: { fill: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  })
  private countdownContainer = new Container()
  private countdownBg = new Graphics()
  private countdownFill = new Graphics()
  private countdownLabel = new Text({
    text: 'START IN',
    style: { fill: '#f7d19f', fontSize: 12, letterSpacing: 2, fontWeight: '600' },
  })
  private countdownTime = new Text({
    text: '',
    style: {
      fill: '#ffffff',
      fontSize: 48,
      fontWeight: '700',
      fontFamily: 'IBM Plex Mono, monospace',
    },
  })

  private readonly mapScaleBase = 560
  private readonly boatScaleBase = 850

  private boats = new Map<string, BoatView>()

  constructor(private app: Application) {
    this.app.stage.addChild(this.waterLayer, this.courseLayer, this.overlayLayer, this.boatLayer, this.hudLayer)

    this.countdownLabel.anchor.set(0.5)
    this.countdownTime.anchor.set(0.5)
    this.countdownContainer.addChild(
      this.countdownBg,
      this.countdownFill,
      this.countdownLabel,
      this.countdownTime,
    )
    this.countdownContainer.visible = false

    this.hudLayer.addChild(
      this.windArrow,
      this.windArrowFill,
      this.windText,
      this.timerText,
      this.countdownContainer,
    )
    this.windText.position.set(20, 100)
    this.timerText.position.set(20, 64)

    this.drawWater()
  }

  static currentWindDeg = 0

  update(state: RaceState) {
    RaceScene.currentWindDeg = state.wind.directionDeg
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
    const scale = Math.min(width, height) / this.mapScaleBase
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
    this.drawDebugCrossingGuides(state, map)
    this.drawDebugAnnotations(state, map)
  }

  private drawMarks(state: RaceState, map: ScreenMapper) {
    this.courseLayer.setStrokeStyle({ width: 2, color: 0x5174b3, alpha: 0.6 })
    state.marks.forEach((mark) => {
      const { x, y } = map(mark)
      this.courseLayer.fill({ color: 0xffff00, alpha: 0.8 })
      this.courseLayer.circle(x, y, 6)
      this.courseLayer.fill()
      this.courseLayer.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.4 })
      this.drawZoneCircle({ x, y }, 60)
    })
  }

  private drawDebugAnnotations(state: RaceState, map: ScreenMapper) {
    this.overlayLayer.removeChildren()
    if (!appEnv.debugHud) return
    this.drawWindShadows(state, map)
    this.drawMarkRadials(state, map)
    this.drawMarkLabels(state, map)
    this.drawNextMarkHighlight(state, map)
    this.drawCrossingMarkers(state, map)
  }

  private drawWindShadows(state: RaceState, map: ScreenMapper) {
    const downwindDeg = normalizeDeg(state.wind.directionDeg + 180)
    const downRad = degToRad(downwindDeg)
    const dir = { x: Math.sin(downRad), y: -Math.cos(downRad) }
    const cross = { x: -dir.y, y: dir.x }
    const coneCos = Math.cos(degToRad(WAKE_CONE_HALF_ANGLE_DEG))

    Object.values(state.boats).forEach((boat) => {
      const factor = boat.wakeFactor ?? 1
      const slowdown = Math.min(WAKE_MAX_SLOWDOWN, 1 - factor)
      const fillAlpha = 0.08 + slowdown * 0.5
      const strokeAlpha = 0.2 + slowdown * 0.6

      const startCenter = boat.pos
      const endCenter = {
        x: boat.pos.x + dir.x * WAKE_LENGTH,
        y: boat.pos.y + dir.y * WAKE_LENGTH,
      }

      const startLeft = {
        x: startCenter.x + cross.x * WAKE_HALF_WIDTH_START,
        y: startCenter.y + cross.y * WAKE_HALF_WIDTH_START,
      }
      const startRight = {
        x: startCenter.x - cross.x * WAKE_HALF_WIDTH_START,
        y: startCenter.y - cross.y * WAKE_HALF_WIDTH_START,
      }
      const endLeft = {
        x: endCenter.x + cross.x * WAKE_HALF_WIDTH_END,
        y: endCenter.y + cross.y * WAKE_HALF_WIDTH_END,
      }
      const endRight = {
        x: endCenter.x - cross.x * WAKE_HALF_WIDTH_END,
        y: endCenter.y - cross.y * WAKE_HALF_WIDTH_END,
      }

      // Only draw wakes downwind (respect cone) by checking a point slightly behind
      const sampleDir = { x: dir.x, y: dir.y }
      const align = sampleDir.x * dir.x + sampleDir.y * dir.y
      if (align < coneCos) return

      const g = new Graphics()
      g.setStrokeStyle({ width: 1.5, color: 0xffcf70, alpha: strokeAlpha })
      g.fill({ color: 0xffcf70, alpha: fillAlpha })

      const pts = [startLeft, endLeft, endRight, startRight].map(map)
      g.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach((p) => g.lineTo(p.x, p.y))
      g.closePath()
      g.fill()
      g.stroke()

      // Outline the cone edges for clarity
      const coneEdgeLeft = new Graphics()
      coneEdgeLeft.setStrokeStyle({ width: 1, color: 0xffcf70, alpha: 0.25 })
      coneEdgeLeft.moveTo(map(startCenter).x, map(startCenter).y)
      coneEdgeLeft.lineTo(map(endLeft).x, map(endLeft).y)
      coneEdgeLeft.stroke()

      const coneEdgeRight = new Graphics()
      coneEdgeRight.setStrokeStyle({ width: 1, color: 0xffcf70, alpha: 0.25 })
      coneEdgeRight.moveTo(map(startCenter).x, map(startCenter).y)
      coneEdgeRight.lineTo(map(endRight).x, map(endRight).y)
      coneEdgeRight.stroke()

      this.overlayLayer.addChild(g, coneEdgeLeft, coneEdgeRight)
    })
  }

  private drawMarkRadials(state: RaceState, map: ScreenMapper) {
    const radialLength = 70
    
    // Track which marks are part of gates so we draw them differently
    const gateMarkIndices = new Set<number>()
    courseLegs.forEach((leg) => {
      if (leg.kind === 'gate' && leg.gateMarkIndices) {
        leg.gateMarkIndices.forEach((idx) => gateMarkIndices.add(idx))
      }
    })
    
    // Draw gate lines and radials for gate marks
    courseLegs.forEach((leg) => {
      if (leg.kind === 'gate' && leg.gateMarkIndices) {
        this.drawGateRadials(state, map, leg.gateMarkIndices, radialLength)
      }
    })
    
    // Draw regular radials for non-gate marks
    courseMarkAnnotations.forEach((annotation) => {
      // Skip gate marks - they're handled above
      if (gateMarkIndices.has(annotation.markIndex)) return
      
      const mark = state.marks[annotation.markIndex]
      if (!mark) return
      const { x, y } = map(mark)
      const color = annotation.rounding === 'port' ? 0xff6b6b : 0x00ffc3
      const kind: 'windward' | 'leeward' = annotation.kind === 'leeward' ? 'leeward' : 'windward'
      const steps = radialSets[kind][annotation.rounding]
      steps.forEach((step, idx) => {
        const dx = step.axis === 'x' ? step.direction : 0
        const dy = step.axis === 'y' ? step.direction : 0
        const endX = x + dx * radialLength
        const endY = y + dy * radialLength
        const line = new Graphics()
        line.setStrokeStyle({ width: 2, color, alpha: 0.6 })
        line.moveTo(x, y)
        line.lineTo(endX, endY)
        line.stroke()
        const tag = new Text({
          text: `${idx + 1}`,
          style: { fill: color, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' },
        })
        tag.anchor.set(0.5)
        tag.position.set(endX, endY)
        this.overlayLayer.addChild(line, tag)
      })
    })
  }
  
  private drawGateRadials(
    state: RaceState,
    map: ScreenMapper,
    gateMarkIndices: [number, number],
    radialLength: number,
  ) {
    const [leftIdx, rightIdx] = gateMarkIndices
    const leftMark = state.marks[leftIdx]
    const rightMark = state.marks[rightIdx]
    if (!leftMark || !rightMark) return
    
    const leftScreen = map(leftMark)
    const rightScreen = map(rightMark)
    
    // Draw the gate line (stage 1) - dashed yellow line between the two marks
    const gateLine = new Graphics()
    gateLine.setStrokeStyle({ width: 3, color: 0xffe066, alpha: 0.8 })
    
    // Draw dashed line
    const segments = 8
    const dx = (rightScreen.x - leftScreen.x) / segments
    const dy = (rightScreen.y - leftScreen.y) / segments
    for (let i = 0; i < segments; i += 2) {
      gateLine.moveTo(leftScreen.x + dx * i, leftScreen.y + dy * i)
      gateLine.lineTo(leftScreen.x + dx * (i + 1), leftScreen.y + dy * (i + 1))
    }
    gateLine.stroke()
    
    // Draw "1" label at midpoint of gate line
    const midX = (leftScreen.x + rightScreen.x) / 2
    const midY = (leftScreen.y + rightScreen.y) / 2
    const gateLabel = new Text({
      text: '1',
      style: { fill: 0xffe066, fontSize: 13, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 'bold' },
    })
    gateLabel.anchor.set(0.5)
    gateLabel.position.set(midX, midY - 12)
    this.overlayLayer.addChild(gateLine, gateLabel)
    
    // Draw radials for left gate mark (stages 2, 3)
    const leftSteps = gateRadials.left
    leftSteps.forEach((step, idx) => {
      const dx = step.axis === 'x' ? step.direction : 0
      const dy = step.axis === 'y' ? step.direction : 0
      const endX = leftScreen.x + dx * radialLength
      const endY = leftScreen.y + dy * radialLength
      const line = new Graphics()
      line.setStrokeStyle({ width: 2, color: 0x00ffc3, alpha: 0.6 }) // Green for starboard
      line.moveTo(leftScreen.x, leftScreen.y)
      line.lineTo(endX, endY)
      line.stroke()
      const tag = new Text({
        text: `${idx + 2}`, // +2 because stage 1 is the gate line
        style: { fill: 0x00ffc3, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' },
      })
      tag.anchor.set(0.5)
      tag.position.set(endX, endY)
      this.overlayLayer.addChild(line, tag)
    })
    
    // Draw radials for right gate mark (stages 2, 3)
    const rightSteps = gateRadials.right
    rightSteps.forEach((step, idx) => {
      const dx = step.axis === 'x' ? step.direction : 0
      const dy = step.axis === 'y' ? step.direction : 0
      const endX = rightScreen.x + dx * radialLength
      const endY = rightScreen.y + dy * radialLength
      const line = new Graphics()
      line.setStrokeStyle({ width: 2, color: 0xff6b6b, alpha: 0.6 }) // Red for port
      line.moveTo(rightScreen.x, rightScreen.y)
      line.lineTo(endX, endY)
      line.stroke()
      const tag = new Text({
        text: `${idx + 2}`, // +2 because stage 1 is the gate line
        style: { fill: 0xff6b6b, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' },
      })
      tag.anchor.set(0.5)
      tag.position.set(endX, endY)
      this.overlayLayer.addChild(line, tag)
    })
  }

  private drawMarkLabels(state: RaceState, map: ScreenMapper) {
    const legCounts: Record<string, number> = {}
    courseMarkAnnotations.forEach((annotation) => {
      const mark = state.marks[annotation.markIndex]
      if (!mark) return
      const key = annotation.sequences.join('-')
      legCounts[key] = (legCounts[key] ?? 0) + 1
    })

    const variantIndex: Record<string, number> = {}

    courseMarkAnnotations.forEach((annotation) => {
      const mark = state.marks[annotation.markIndex]
      if (!mark) return
      const key = annotation.sequences.join('-')
      const count = legCounts[key]
      if (count > 1) {
        variantIndex[key] = (variantIndex[key] ?? 0) + 1
      }
      const variant = count > 1 ? variantIndex[key] : undefined
      const suffix = count > 1 ? `.${variant}` : ''
      const textLabel = `M${annotation.sequences.join('/')}${suffix}`

      const { x, y } = map(mark)
    const label = new Text({
      text: textLabel,
      style: {
        fill: '#ffffff',
        fontSize: 12,
        fontFamily: 'IBM Plex Mono, monospace',
        fontWeight: 'bold',
      },
    })
    label.anchor.set(0.5)
    label.position.set(x, y - 20)
    this.overlayLayer.addChild(label)
    })
  }

  private drawNextMarkHighlight(state: RaceState, map: ScreenMapper) {
    const boat = state.boats[identity.boatId]
    if (!boat) return
    const currentLeg = courseLegs.find((entry) => entry.markIndices.includes(boat.nextMarkIndex ?? -1))
    const marksToHighlight =
      currentLeg && currentLeg.sequence
        ? courseLegs
            .filter((entry) => entry.sequence === currentLeg.sequence)
            .flatMap((entry) => entry.markIndices)
        : [boat.nextMarkIndex ?? 0]
    marksToHighlight.forEach((markIndex) => {
      const mark = state.marks[markIndex]
      if (!mark) return
      const { x, y } = map(mark)
      const circle = new Graphics()
      circle.setStrokeStyle({ width: 3, color: 0x00ffc3, alpha: 0.9 })
      circle.circle(x, y, 24)
      circle.stroke()
      this.overlayLayer.addChild(circle)
    })
  }

  private drawCrossingMarkers(state: RaceState, map: ScreenMapper) {
    if (!appEnv.debugHud) return
    
    // Find the most recent completed rounding (stage = stagesTotal) per boat
    // to filter out old markers
    const completedRoundings = new Map<string, number>() // boatId -> event time
    const allLapEvents = raceStore
      .getRecentEvents()
      .filter((event) => event.kind === 'rule_hint' && event.message.startsWith('[lap-debug]'))
    
    allLapEvents.forEach((event) => {
      // Check if this is a completed rounding (stage equals total)
      const stageMatch = event.message.match(/stage=(\d+)\/(\d+)/)
      if (stageMatch) {
        const [, stage, total] = stageMatch
        if (stage === total) {
          event.boats?.forEach((boatId) => {
            const existing = completedRoundings.get(boatId) ?? 0
            if (event.t > existing) {
              completedRoundings.set(boatId, event.t)
            }
          })
        }
      }
    })
    
    // Only show events that occurred after the last completed rounding for each boat
    const lapEvents = allLapEvents
      .filter((event) => {
        const boatId = event.boats?.[0]
        if (!boatId) return false
        const completedAt = completedRoundings.get(boatId)
        // Show if no completed rounding, or if this event is after the completion
        return completedAt === undefined || event.t > completedAt
      })
      .slice(-6)
    
    lapEvents.forEach((event) => {
      event.boats?.forEach((boatId) => {
        const boat = state.boats[boatId]
        if (!boat) return
        const pos = map(boat.pos)
        const marker = new Graphics()
        marker.setStrokeStyle({ width: 2, color: 0x00ffc3, alpha: 0.8 })
        marker.circle(pos.x, pos.y, 16)
        marker.stroke()
        const label = new Text({
          text: event.message.replace('[lap-debug]', '').trim(),
          style: { fill: '#00ffc3', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', align: 'left' },
        })
        label.anchor.set(0, 0.5)
        label.position.set(pos.x + 18, pos.y)
        const group = new Container()
        group.addChild(marker, label)
        this.overlayLayer.addChild(group)
      })
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
      this.drawZoneCircle(gateMark, 48)
    })
  }

  private drawDebugCrossingGuides(state: RaceState, map: ScreenMapper) {
    if (!appEnv.debugHud) return
    const guideColor = 0x32e5ff

    const windward = state.marks[0]
    if (windward) {
      const span = 400
      const start = map({ x: windward.x - span, y: windward.y })
      const end = map({ x: windward.x + span, y: windward.y })
      this.drawGuideLine(start, end, 1, guideColor)
    }

    const gateY = (state.leewardGate.left.y + state.leewardGate.right.y) / 2
    const minX = Math.min(state.leewardGate.left.x, state.leewardGate.right.x)
    const maxX = Math.max(state.leewardGate.left.x, state.leewardGate.right.x)
    const gateStart = map({ x: minX, y: gateY })
    const gateEnd = map({ x: maxX, y: gateY })
    this.drawGuideLine(gateStart, gateEnd, 1, guideColor)
  }

  private drawGuideLine(
    start: { x: number; y: number },
    end: { x: number; y: number },
    direction: 1 | -1,
    color: number,
  ) {
    this.courseLayer.setStrokeStyle({ width: 2, color, alpha: 0.5 })
    this.courseLayer.moveTo(start.x, start.y)
    this.courseLayer.lineTo(end.x, end.y)
    this.courseLayer.stroke()
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    this.drawDirectionArrow(mid, direction, color)
  }

  private drawDirectionArrow(center: { x: number; y: number }, direction: 1 | -1, color: number) {
    const length = 28
    const tip = { x: center.x, y: center.y + direction * length }
    const tail = { x: center.x, y: center.y - direction * length }
    const wing = 9
    this.courseLayer.setStrokeStyle({ width: 2, color, alpha: 0.5 })
    this.courseLayer.moveTo(tail.x, tail.y)
    this.courseLayer.lineTo(tip.x, tip.y)
    this.courseLayer.moveTo(tip.x, tip.y)
    this.courseLayer.lineTo(tip.x - 6, tip.y - direction * wing)
    this.courseLayer.moveTo(tip.x, tip.y)
    this.courseLayer.lineTo(tip.x + 6, tip.y - direction * wing)
    this.courseLayer.stroke()
  }

  private drawZoneCircle(center: { x: number; y: number }, radius: number) {
    const segments = 48
    const step = (Math.PI * 2) / segments
    let angle = 0
    for (let i = 0; i < segments; i += 1) {
      const startAngle = angle
      const endAngle = angle + step * 0.6
      const sx = center.x + Math.cos(startAngle) * radius
      const sy = center.y + Math.sin(startAngle) * radius
      const ex = center.x + Math.cos(endAngle) * radius
      const ey = center.y + Math.sin(endAngle) * radius
      this.courseLayer.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.2 })
      this.courseLayer.moveTo(sx, sy)
      this.courseLayer.lineTo(ex, ey)
      angle += step
    }
    this.courseLayer.stroke()
  }

  private drawBoats(state: RaceState) {
    const map = this.mapToScreen()
    const { width, height } = this.app.canvas
    const scale = Math.min(width, height) / this.boatScaleBase
    const seen = new Set<string>()
    Object.values(state.boats).forEach((boat) => {
      seen.add(boat.id)
      if (!this.boats.has(boat.id)) {
        const view = new BoatView(boat.color)
        this.boats.set(boat.id, view)
        this.boatLayer.addChild(view.container)
      }
      const isPlayer = boat.id === identity.boatId
      this.boats.get(boat.id)?.update(boat, map, scale, isPlayer)
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

    const center = { x: 80, y: 150 }
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

    this.drawCountdown(state)
  }

  private drawCountdown(state: RaceState) {
    const show = state.phase === 'prestart' && state.countdownArmed
    this.countdownContainer.visible = show
    if (!show) {
      this.countdownBg.clear()
      this.countdownFill.clear()
      return
    }

    const stageWidth = this.app.canvas.width
    const stageHeight = this.app.canvas.height
    const totalSeconds = Math.max(1, appEnv.countdownSeconds)
    const remainingSeconds = Math.max(0, -state.t)
    const percent = clamp01(remainingSeconds / totalSeconds)
    const secondsRounded = Math.ceil(remainingSeconds)
    const minutes = Math.floor(secondsRounded / 60)
    const seconds = secondsRounded % 60
    const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`
    const finalWarning = secondsRounded <= 10

    const overlayWidth = Math.min(stageWidth - 32, 640)
    const overlayHeight = Math.min(stageHeight * 0.25, 140)
    const overlayX = (stageWidth - overlayWidth) / 2
    const overlayY = Math.max(16, stageHeight * 0.08)
    const barPadding = 24
    const barWidth = Math.max(60, overlayWidth - barPadding * 2)
    const barHeight = 18
    const barX = overlayX + barPadding
    const barY = overlayY + overlayHeight - barPadding - barHeight

    const fillColor = finalWarning ? 0xff8f70 : 0x53e0ff

    this.countdownBg.clear()
    this.countdownBg.fill({ color: 0x050a1a, alpha: 0.85 })
    this.countdownBg.roundRect(overlayX, overlayY, overlayWidth, overlayHeight, 24)
    this.countdownBg.fill()

    this.countdownFill.clear()
    if (percent > 0) {
      this.countdownFill.fill({ color: fillColor, alpha: 0.95 })
      this.countdownFill.roundRect(barX, barY, barWidth * percent, barHeight, barHeight / 2)
      this.countdownFill.fill()
    }
    this.countdownFill.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.2 })
    this.countdownFill.roundRect(barX, barY, barWidth, barHeight, barHeight / 2)
    this.countdownFill.stroke()

    const centerX = overlayX + overlayWidth / 2
    this.countdownLabel.position.set(centerX, overlayY + 28)
    this.countdownTime.position.set(centerX, overlayY + overlayHeight / 2)
    this.countdownTime.text = timeText
  }
}

