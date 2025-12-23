import { Application, Container, Graphics, Text } from 'pixi.js'
import { appEnv } from '@/config/env'
import type { BoatState, RaceState, Vec2 } from '@/types/race'
import { identity } from '@/net/identity'
import { angleDiff } from '@/logic/physics'
import { getWindFieldConfig, sampleWindDeltaKts } from '@/logic/windField'
import {
  BOAT_BOW_OFFSET,
  BOAT_BOW_RADIUS,
  BOAT_LENGTH,
  BOAT_STERN_OFFSET,
  BOAT_STERN_RADIUS,
  WAKE_HALF_WIDTH_END,
  WAKE_HALF_WIDTH_START,
  WAKE_LENGTH,
  WAKE_MAX_SLOWDOWN,
} from '@/logic/constants'
import { raceStore } from '@/state/raceStore'
import {
  courseLegs,
  courseMarkAnnotations,
  radialSets,
  gateRadials,
} from '@/config/course'

const degToRad = (deg: number) => (deg * Math.PI) / 180
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const normalizeDeg = (deg: number) => {
  const wrapped = deg % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

// Mark-zone radius in world units.
// Note: our boat sprite is drawn ~2× the physics/collision `BOAT_LENGTH` (see hull points),
// so use a multiplier that makes the ring read like ~2 boat lengths on screen.
const MARK_ZONE_RADIUS = 4 * BOAT_LENGTH

export type CameraMode = 'follow' | 'birdseye'

class BoatView {
  container = new Container()
  hull = new Graphics()
  sail = new Graphics()
  projection = new Graphics()
  collision = new Graphics()
  wakeIndicator = new Graphics()
  wakeLabel = new Text({
    text: '',
    style: {
      fill: '#ffcf70',
      fontSize: 10,
      align: 'center',
      fontFamily: 'IBM Plex Mono, monospace',
    },
  })
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
    // Draw hull/sail first, then overlay collision outlines for visibility
    this.container.addChild(
      this.projection,
      this.hull,
      this.sail,
      this.collision,
      this.wakeIndicator,
      this.wakeLabel,
      this.nameTag,
    )
    // Collision footprint circles are a debug overlay; hide unless debug HUD is enabled.
    this.collision.visible = appEnv.debugHud
    this.wakeIndicator.visible = false
    this.wakeLabel.visible = false
    this.nameTag.position.set(-20, 18)
    this.wakeLabel.position.set(0, -35)
    this.wakeLabel.anchor.set(0.5)
  }

  private drawBoat() {
    // Collision footprint (capsule: bow + stern circles to match rules)
    this.collision.clear()
    this.collision.setStrokeStyle({ width: 2, color: 0xffff00, alpha: 0.6 })
    this.collision.fill({ color: 0xffcf70, alpha: 0.08 })
    // Stern (larger)
    this.collision.circle(0, Math.abs(BOAT_STERN_OFFSET), BOAT_STERN_RADIUS)
    // Bow (smaller)
    this.collision.circle(0, -Math.abs(BOAT_BOW_OFFSET), BOAT_BOW_RADIUS)
    this.collision.fill()
    this.collision.stroke()

    this.hull.clear()
    this.hull.fill({ color: this.color })
    const hullPoints = [0, -20, 10, 10, 0, 16, -10, 10]
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
      leewardSign * 32,
      4, // control point
      leewardSign * 10,
      0, // head of the sail, slightly forward
    )

    this.sail.closePath()
    this.sail.fill()
  }

  update(boat: BoatState, isPlayer = false) {
    this.container.position.set(boat.pos.x, boat.pos.y)
    this.container.scale.set(1)
    this.container.rotation = degToRad(boat.headingDeg)
    const awa = angleDiff(RaceScene.currentWindDeg, boat.headingDeg)
    const leewardSign: 1 | -1 = awa >= 0 ? -1 : 1
    this.drawSailShape(leewardSign)
    const absAwa = Math.abs(angleDiff(boat.headingDeg, RaceScene.currentWindDeg))
    // NOTE: Our sail geometry starts fairly "eased" at 0° rotation, and rotating it
    // pulls it closer to centerline (more trimmed in). So: upwind (small AWA) => more
    // rotation, downwind (large AWA) => less rotation.
    const easedFactor = Math.min(1, absAwa / 140)
    const trimmedInFactor = 1 - easedFactor
    const rotationDeg = leewardSign * (8 + trimmedInFactor * 24)
    this.sail.rotation = degToRad(rotationDeg)
    this.nameTag.text = boat.penalties ? `${boat.name} (${boat.penalties})` : boat.name
    if (boat.overEarly || boat.fouled || boat.penalties > 0) {
      this.nameTag.style.fill = '#ff6b6b'
    } else {
      this.nameTag.style.fill = '#ffffff'
    }
    this.drawProjection(boat, isPlayer)
    this.updateWakeIndicator(boat)
  }

  private updateWakeIndicator(boat: BoatState) {
    const wakeFactor = boat.wakeFactor ?? 1
    const isAffected = wakeFactor < 0.995
    const showIndicator = appEnv.debugHud && isAffected

    this.wakeIndicator.visible = showIndicator
    this.wakeLabel.visible = showIndicator

    if (showIndicator) {
      const slowdown = 1 - wakeFactor
      const slowdownPercent = Math.round(slowdown * 100)
      const intensity = Math.min(1, slowdown / WAKE_MAX_SLOWDOWN)

      // Draw a colored outline around the boat to show it's in a wake
      this.wakeIndicator.clear()
      const outlineWidth = 3
      const alpha = 0.3 + intensity * 0.5
      this.wakeIndicator.setStrokeStyle({
        width: outlineWidth,
        color: 0xffcf70,
        alpha,
      })

      // Draw outline around the hull shape
      const hullPoints = [0, -20, 10, 10, 0, 16, -10, 10]
      this.wakeIndicator.poly(hullPoints)
      this.wakeIndicator.stroke()

      // Update label text
      this.wakeLabel.text = `Wake -${slowdownPercent}%`
      this.wakeLabel.style.fill = '#ffcf70'
      this.wakeLabel.alpha = 0.8 + intensity * 0.2
    }
  }

  private drawProjection(boat: BoatState, isPlayer: boolean) {
    this.projection.clear()
    const baseLength = Math.max(40, boat.speed * 6)
    // Draw in world units so the projection scales with the camera/boat size.
    // Previously this divided by `scale` to keep a constant pixel length, but that
    // makes it look shorter relative to the boat when zoomed in.
    const length = isPlayer ? baseLength * 4 : baseLength
    this.projection
      .setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.3 })
      .moveTo(0, -10)
      .lineTo(0, -10 - length)
      .stroke()
  }
}

export class RaceScene {
  private waterLayer = new Graphics()
  private worldLayer = new Container()
  private windFieldLayer = new Graphics()
  private courseLayer = new Graphics()
  private contextLayer = new Graphics()
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
  private readonly followZoomFactor = appEnv.followZoomFactor
  private readonly birdseyeZoomFactor = appEnv.birdseyeZoomFactor
  private cameraMode: CameraMode = 'follow'
  private followBoatId: string | null = null

  private boats = new Map<string, BoatView>()

  constructor(
    private app: Application,
    options?: {
      cameraMode?: CameraMode
    },
  ) {
    // Render order (bottom -> top):
    // - windFieldLayer: moving puffs/lulls visualization (world-space)
    // - courseLayer: static course visuals
    // - contextLayer: follow-mode guidance line(s)
    // - overlayLayer: debug overlays
    // - boatLayer: boats + name tags, etc.
    this.worldLayer.addChild(
      this.windFieldLayer,
      this.courseLayer,
      this.contextLayer,
      this.overlayLayer,
      this.boatLayer,
    )
    this.app.stage.addChild(this.waterLayer, this.worldLayer, this.hudLayer)
    if (options?.cameraMode) {
      this.cameraMode = options.cameraMode
    }

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
    // Phase/time line removed to reduce clutter; move wind readout up.
    this.windText.position.set(20, 74)
    // Wind info now lives in the HTML HUD cluster; keep only the arrow in-canvas.
    this.windText.visible = false
    // Wind arrow is now rendered in the HTML HUD cluster for easier layout.
    this.windArrow.visible = false
    this.windArrowFill.visible = false
    this.timerText.visible = false

    this.drawWater()
  }

  static currentWindDeg = 0

  setCameraMode(mode: CameraMode) {
    this.cameraMode = mode
  }

  setFollowBoatId(boatId: string | null) {
    this.followBoatId = boatId
  }

  update(state: RaceState) {
    RaceScene.currentWindDeg = state.wind.directionDeg
    this.applyCameraTransform(state)
    this.drawWindField(state)
    this.drawCourse(state)
    this.drawFollowContext(state)
    this.drawBoats(state)
    this.drawHud(state)
  }

  resize() {
    this.drawWater()
  }

  private drawWater() {
    const { width, height } = this.app.canvas
    this.waterLayer.clear()
    this.waterLayer.fill({ color: 0x021428 })
    this.waterLayer.rect(0, 0, width, height)
    this.waterLayer.fill()
  }

  private getMapScale(): number {
    const { width, height } = this.app.canvas
    return Math.min(width, height) / this.mapScaleBase
  }

  private getCourseBounds(state: RaceState) {
    const points: Vec2[] = []
    if (state.marks?.length) points.push(...state.marks)
    points.push(state.startLine.pin, state.startLine.committee)
    points.push(state.leewardGate.left, state.leewardGate.right)

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of points) {
      if (!p) continue
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
    }

    return { minX, minY, maxX, maxY }
  }

  private getCameraTransform(state: RaceState) {
    const { width, height } = this.app.canvas
    const baseScale = this.getMapScale()
    const bounds = this.getCourseBounds(state)
    const courseCenter = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    }

    if (this.cameraMode === 'birdseye') {
      const paddingPx = 96
      const availableW = Math.max(1, width - paddingPx * 2)
      const availableH = Math.max(1, height - paddingPx * 2)
      const worldW = Math.max(1, bounds.maxX - bounds.minX)
      const worldH = Math.max(1, bounds.maxY - bounds.minY)
      const fitScale = Math.min(availableW / worldW, availableH / worldH)
      const computed = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : baseScale
      // Slightly zoom out in birdseye so pre-start spawn (often just below the line) is still visible.
      const scale = computed * Math.max(0.1, this.birdseyeZoomFactor)
      return { scale, centerWorld: courseCenter }
    }

    // follow
    const targetId = this.followBoatId ?? identity.boatId
    const targetBoat = state.boats[targetId]
    const centerWorld = targetBoat?.pos ?? courseCenter
    const scale = baseScale * this.followZoomFactor
    return { scale, centerWorld }
  }

  /**
   * Pick the closest boat at a canvas pixel coordinate.
   * Returns the boatId if within a reasonable radius, otherwise null.
   */
  pickBoatAtCanvasPoint(xPx: number, yPx: number, state: RaceState): string | null {
    const { scale, centerWorld } = this.getCameraTransform(state)
    const { width, height } = this.app.canvas
    // Inverse of applyCameraTransform:
    const worldX = centerWorld.x + (xPx - width / 2) / scale
    const worldY = centerWorld.y + (yPx - height / 2) / scale

    let bestId: string | null = null
    let bestDist2 = Infinity

    Object.values(state.boats).forEach((boat) => {
      const dx = boat.pos.x - worldX
      const dy = boat.pos.y - worldY
      const d2 = dx * dx + dy * dy
      if (d2 < bestDist2) {
        bestDist2 = d2
        bestId = boat.id
      }
    })

    if (!bestId || !Number.isFinite(bestDist2)) return null
    // Threshold in world units. Boat hull is roughly ~40px tall in local coords; use BOAT_LENGTH as baseline.
    const pickRadius = Math.max(BOAT_LENGTH * 2.2, 28)
    return bestDist2 <= pickRadius * pickRadius ? bestId : null
  }

  /**
   * Convert a canvas pixel coordinate (canvas internal pixel space) to world coordinates.
   */
  canvasPointToWorld(
    xPx: number,
    yPx: number,
    state: RaceState,
  ): { x: number; y: number } {
    const { scale, centerWorld } = this.getCameraTransform(state)
    const { width, height } = this.app.canvas
    return {
      x: centerWorld.x + (xPx - width / 2) / scale,
      y: centerWorld.y + (yPx - height / 2) / scale,
    }
  }

  /**
   * Convert a boat's world position to canvas pixel coordinates (in canvas internal pixel space).
   */
  getBoatCanvasPoint(boatId: string, state: RaceState): { x: number; y: number } | null {
    const boat = state.boats[boatId]
    if (!boat) return null
    const { scale, centerWorld } = this.getCameraTransform(state)
    const { width, height } = this.app.canvas
    return {
      x: width / 2 + (boat.pos.x - centerWorld.x) * scale,
      y: height / 2 + (boat.pos.y - centerWorld.y) * scale,
    }
  }

  private applyCameraTransform(state: RaceState) {
    const { width, height } = this.app.canvas
    const { scale, centerWorld } = this.getCameraTransform(state)
    this.worldLayer.scale.set(scale)
    this.worldLayer.position.set(
      width / 2 - centerWorld.x * scale,
      height / 2 - centerWorld.y * scale,
    )
  }

  private getVisibleWorldBounds(state: RaceState) {
    const { width, height } = this.app.canvas
    const { scale, centerWorld } = this.getCameraTransform(state)
    const inv = 1 / Math.max(0.0001, scale)
    const halfW = (width / 2) * inv
    const halfH = (height / 2) * inv
    return {
      minX: centerWorld.x - halfW,
      maxX: centerWorld.x + halfW,
      minY: centerWorld.y - halfH,
      maxY: centerWorld.y + halfH,
    }
  }

  private drawWindField(state: RaceState) {
    const cfg = getWindFieldConfig(state)
    this.windFieldLayer.clear()
    if (!cfg) return

    const { minX, maxX, minY, maxY } = this.getVisibleWorldBounds(state)

    // Dynamic tile sizing to keep draw calls bounded.
    const maxTiles = 1800
    let tile = Math.max(6, cfg.tileSizeWorld)
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)
    let nx = Math.ceil(w / tile)
    let ny = Math.ceil(h / tile)
    const tileCount = nx * ny
    if (tileCount > maxTiles) {
      const factor = Math.sqrt(tileCount / maxTiles)
      tile *= factor
      nx = Math.ceil(w / tile)
      ny = Math.ceil(h / tile)
    }

    const startX = Math.floor(minX / tile) * tile
    const endX = Math.ceil(maxX / tile) * tile
    const startY = Math.floor(minY / tile) * tile
    const endY = Math.ceil(maxY / tile) * tile

    // Batch rectangles into alpha buckets per sign to reduce fill state switches.
    const buckets = 6
    const puffRects: number[][] = Array.from({ length: buckets }, () => [])
    const lullRects: number[][] = Array.from({ length: buckets }, () => [])
    const minNormToDraw = 0.07

    for (let y = startY; y < endY; y += tile) {
      for (let x = startX; x < endX; x += tile) {
        const center = { x: x + tile / 2, y: y + tile / 2 }
        const delta = sampleWindDeltaKts(state, center)
        if (!delta) continue
        const norm = Math.abs(delta) / Math.max(0.001, cfg.intensityKts)
        if (norm < minNormToDraw) continue
        const b = Math.min(buckets - 1, Math.floor(norm * buckets))
        const list = delta > 0 ? puffRects[b] : lullRects[b]
        list.push(x, y, tile, tile)
      }
    }

    const puffColor = 0x19d3c5 // teal
    const lullColor = 0x12345a // deep blue
    const maxAlpha = 0.24

    for (let b = 0; b < buckets; b += 1) {
      const alpha = maxAlpha * ((b + 1) / buckets)
      const puff = puffRects[b]
      if (puff.length) {
        this.windFieldLayer.fill({ color: puffColor, alpha })
        for (let i = 0; i < puff.length; i += 4) {
          this.windFieldLayer.rect(puff[i], puff[i + 1], puff[i + 2], puff[i + 3])
        }
        this.windFieldLayer.fill()
      }
      const lull = lullRects[b]
      if (lull.length) {
        this.windFieldLayer.fill({ color: lullColor, alpha })
        for (let i = 0; i < lull.length; i += 4) {
          this.windFieldLayer.rect(lull[i], lull[i + 1], lull[i + 2], lull[i + 3])
        }
        this.windFieldLayer.fill()
      }
    }
  }

  private drawCourse(state: RaceState) {
    this.courseLayer.clear()
    this.drawStartLine(state)
    this.drawMarks(state)
    this.drawLeewardGate(state)
    this.drawDebugCrossingGuides(state)
    this.drawDebugAnnotations(state)
  }

  private drawFollowContext(state: RaceState) {
    this.contextLayer.clear()
    if (this.cameraMode !== 'follow') return

    const boat = state.boats[identity.boatId]
    if (!boat || boat.finished) return

    const to = this.getFollowContextTarget(state, boat)
    if (!to) return

    // Keep the line readable at any zoom by drawing with pixel-consistent dot size/spacing.
    const scale = this.worldLayer.scale.x || 1
    const pxToWorld = 1 / Math.max(0.0001, scale)
    const dotRadiusWorld = 1.35 * pxToWorld
    const dotSpacingWorld = 11 * pxToWorld
    const startOffsetWorld = 14 * pxToWorld
    const endOffsetWorld = 10 * pxToWorld

    // Use a distinct accent color so this doesn't read like zone outlines.
    this.contextLayer.fill({ color: 0x70d6ff, alpha: 0.42 })
    this.drawDottedLine(
      this.contextLayer,
      boat.pos,
      to,
      dotRadiusWorld,
      dotSpacingWorld,
      startOffsetWorld,
      endOffsetWorld,
    )
    this.contextLayer.fill()
  }

  private getFollowContextTarget(state: RaceState, boat: BoatState): Vec2 | null {
    const marks = state.marks
    if (!marks.length) return null

    const nextIndex = Math.max(0, boat.nextMarkIndex ?? 0) % marks.length

    // By convention in this project:
    // - marks[0] is the windward mark
    // - marks[1]/marks[2] are start line committee/pin
    // - marks[3]/marks[4] are leeward gate marks
    if (nextIndex === 1 || nextIndex === 2) {
      return {
        x: (state.startLine.pin.x + state.startLine.committee.x) / 2,
        y: (state.startLine.pin.y + state.startLine.committee.y) / 2,
      }
    }
    if (nextIndex === 3 || nextIndex === 4) {
      return {
        x: (state.leewardGate.left.x + state.leewardGate.right.x) / 2,
        y: (state.leewardGate.left.y + state.leewardGate.right.y) / 2,
      }
    }

    return marks[nextIndex] ?? null
  }

  private drawDottedLine(
    g: Graphics,
    from: Vec2,
    to: Vec2,
    dotRadius: number,
    spacing: number,
    startOffset = 0,
    endOffset = 0,
  ) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.hypot(dx, dy)
    if (!Number.isFinite(dist) || dist <= 0.0001) return

    const ux = dx / dist
    const uy = dy / dist
    const step = Math.max(0.0001, spacing)

    const start = Math.max(0, startOffset)
    const end = Math.max(start, dist - Math.max(0, endOffset))

    for (let s = start; s <= end; s += step) {
      g.circle(from.x + ux * s, from.y + uy * s, dotRadius)
    }
  }

  private drawMarks(state: RaceState) {
    this.courseLayer.setStrokeStyle({ width: 2, color: 0x5174b3, alpha: 0.6 })
    // Gate marks (indices 3 and 4) are drawn separately in drawLeewardGate
    // Pin (index 2) and committee (index 1) don't get zone circles
    const gateMarkIndices = new Set([3, 4])
    const startLineMarkIndices = new Set([1, 2])
    state.marks.forEach((mark, index) => {
      const x = mark.x
      const y = mark.y
      this.courseLayer.fill({ color: 0xffff00, alpha: 0.8 })
      this.courseLayer.circle(x, y, 6)
      this.courseLayer.fill()
      // Skip zone circles for gate marks and start line marks
      if (!gateMarkIndices.has(index) && !startLineMarkIndices.has(index)) {
        this.courseLayer.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.4 })
        this.drawZoneCircle({ x, y }, MARK_ZONE_RADIUS)
      }
    })
  }

  private drawDebugAnnotations(state: RaceState) {
    this.overlayLayer.removeChildren()
    if (!appEnv.debugHud) return
    this.drawWindShadows(state)
    this.drawMarkRadials(state)
    this.drawMarkLabels(state)
    this.drawNextMarkHighlight(state)
    this.drawCrossingMarkers(state)
    this.drawCameraDebug(state)
  }

  private drawCameraDebug(state: RaceState) {
    const boat = state.boats[identity.boatId]
    if (!boat) return

    // World-space ruler: should scale perfectly with zoom if the camera is working correctly.
    const rulerLen = 100
    const origin = { x: boat.pos.x + 30, y: boat.pos.y + 40 }

    const g = new Graphics()
    g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.6 })
    g.moveTo(origin.x, origin.y)
    g.lineTo(origin.x + rulerLen, origin.y)
    g.moveTo(origin.x, origin.y - 4)
    g.lineTo(origin.x, origin.y + 4)
    g.moveTo(origin.x + rulerLen, origin.y - 4)
    g.lineTo(origin.x + rulerLen, origin.y + 4)
    g.stroke()

    const label = new Text({
      text: `100u | cam=${this.cameraMode} | scale=${this.worldLayer.scale.x.toFixed(2)}`,
      style: { fill: '#ffffff', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' },
    })
    label.position.set(origin.x, origin.y + 8)
    label.alpha = 0.75

    this.overlayLayer.addChild(g, label)
  }

  private drawWindShadows(state: RaceState) {
    const downwindDeg = normalizeDeg(state.wind.directionDeg + 180)
    const downRad = degToRad(downwindDeg)
    const dir = { x: Math.sin(downRad), y: -Math.cos(downRad) }
    const cross = { x: -dir.y, y: dir.x }

    // Check which boats are actually affecting others (for intensity visualization)
    const boatsAffectingOthers = new Set<string>()
    Object.values(state.boats).forEach((target) => {
      const targetFactor = target.wakeFactor ?? 1
      if (targetFactor < 0.995) {
        // This boat is being affected, find which boats are affecting it
        Object.values(state.boats).forEach((source) => {
          if (source.id === target.id) return
          const dx = target.pos.x - source.pos.x
          const dy = target.pos.y - source.pos.y
          const distSq = dx * dx + dy * dy
          if (distSq === 0 || distSq > (WAKE_LENGTH + WAKE_HALF_WIDTH_END * 2) ** 2)
            return

          const dist = Math.sqrt(distSq)
          const relUnitX = dx / dist
          const relUnitY = dy / dist
          const align = relUnitX * dir.x + relUnitY * dir.y
          if (align > 0) {
            boatsAffectingOthers.add(source.id)
          }
        })
      }
    })

    // In debug mode, show wake zones for all boats (not just those affecting others)
    // This lets you see where the wake effect would be, even when empty
    Object.values(state.boats).forEach((boat) => {
      const isAffectingOthers = boatsAffectingOthers.has(boat.id)

      // Always show in debug mode, or show when actually affecting others
      if (!appEnv.debugHud && !isAffectingOthers) return

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

      // Make visualization more visible when actually affecting others
      const fillAlpha = isAffectingOthers ? 0.15 : 0.05
      const strokeAlpha = isAffectingOthers ? 0.4 : 0.15

      const g = new Graphics()
      g.setStrokeStyle({ width: 1.5, color: 0xffcf70, alpha: strokeAlpha })
      g.fill({ color: 0xffcf70, alpha: fillAlpha })

      const pts = [startLeft, endLeft, endRight, startRight]
      g.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach((p) => g.lineTo(p.x, p.y))
      g.closePath()
      g.fill()
      g.stroke()

      // Outline the cone edges for clarity (only when affecting others)
      if (isAffectingOthers) {
        const coneEdgeLeft = new Graphics()
        coneEdgeLeft.setStrokeStyle({ width: 1, color: 0xffcf70, alpha: 0.3 })
        coneEdgeLeft.moveTo(startCenter.x, startCenter.y)
        coneEdgeLeft.lineTo(endLeft.x, endLeft.y)
        coneEdgeLeft.stroke()

        const coneEdgeRight = new Graphics()
        coneEdgeRight.setStrokeStyle({ width: 1, color: 0xffcf70, alpha: 0.3 })
        coneEdgeRight.moveTo(startCenter.x, startCenter.y)
        coneEdgeRight.lineTo(endRight.x, endRight.y)
        coneEdgeRight.stroke()

        this.overlayLayer.addChild(g, coneEdgeLeft, coneEdgeRight)
      } else {
        this.overlayLayer.addChild(g)
      }
    })
  }

  private drawMarkRadials(state: RaceState) {
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
        this.drawGateRadials(state, leg.gateMarkIndices, radialLength)
      }
    })

    // Draw regular radials for non-gate marks
    courseMarkAnnotations.forEach((annotation) => {
      // Skip gate marks - they're handled above
      if (gateMarkIndices.has(annotation.markIndex)) return

      const mark = state.marks[annotation.markIndex]
      if (!mark) return
      const x = mark.x
      const y = mark.y
      const color = annotation.rounding === 'port' ? 0xff6b6b : 0x00ffc3
      const kind: 'windward' | 'leeward' =
        annotation.kind === 'leeward' ? 'leeward' : 'windward'
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
    gateMarkIndices: [number, number],
    radialLength: number,
  ) {
    const [leftIdx, rightIdx] = gateMarkIndices
    const leftMark = state.marks[leftIdx]
    const rightMark = state.marks[rightIdx]
    if (!leftMark || !rightMark) return

    const leftScreen = leftMark
    const rightScreen = rightMark

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
      style: {
        fill: 0xffe066,
        fontSize: 13,
        fontFamily: 'IBM Plex Mono, monospace',
        fontWeight: 'bold',
      },
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

  private drawMarkLabels(state: RaceState) {
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

      const x = mark.x
      const y = mark.y
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

  private drawNextMarkHighlight(state: RaceState) {
    const boat = state.boats[identity.boatId]
    if (!boat) return
    const currentLeg = courseLegs.find((entry) =>
      entry.markIndices.includes(boat.nextMarkIndex ?? -1),
    )
    const marksToHighlight =
      currentLeg && currentLeg.sequence
        ? courseLegs
            .filter((entry) => entry.sequence === currentLeg.sequence)
            .flatMap((entry) => entry.markIndices)
        : [boat.nextMarkIndex ?? 0]
    marksToHighlight.forEach((markIndex) => {
      const mark = state.marks[markIndex]
      if (!mark) return
      const x = mark.x
      const y = mark.y
      const circle = new Graphics()
      circle.setStrokeStyle({ width: 3, color: 0x00ffc3, alpha: 0.9 })
      circle.circle(x, y, 24)
      circle.stroke()
      this.overlayLayer.addChild(circle)
    })
  }

  private drawCrossingMarkers(state: RaceState) {
    if (!appEnv.debugHud) return

    // Find the most recent completed rounding (stage = stagesTotal) per boat
    // to filter out old markers
    const completedRoundings = new Map<string, number>() // boatId -> event time
    const allLapEvents = raceStore
      .getRecentEvents()
      .filter(
        (event) => event.kind === 'rule_hint' && event.message.startsWith('[lap-debug]'),
      )

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
        const pos = boat.pos
        const marker = new Graphics()
        marker.setStrokeStyle({ width: 2, color: 0x00ffc3, alpha: 0.8 })
        marker.circle(pos.x, pos.y, 16)
        marker.stroke()
        const label = new Text({
          text: event.message.replace('[lap-debug]', '').trim(),
          style: {
            fill: '#00ffc3',
            fontSize: 12,
            fontFamily: 'IBM Plex Mono, monospace',
            align: 'left',
          },
        })
        label.anchor.set(0, 0.5)
        label.position.set(pos.x + 18, pos.y)
        const group = new Container()
        group.addChild(marker, label)
        this.overlayLayer.addChild(group)
      })
    })
  }

  private drawStartLine(state: RaceState) {
    const pin = state.startLine.pin
    const committee = state.startLine.committee
    // Always draw the full start line in world space. Dashes can look “short” when zoomed,
    // so we use opacity (prestart) instead of a dashed pattern.
    const alpha = state.t < 0 ? 0.4 : 0.9
    this.courseLayer.setStrokeStyle({ width: 2, color: 0xffffff, alpha })
    this.courseLayer.moveTo(pin.x, pin.y)
    this.courseLayer.lineTo(committee.x, committee.y)
    this.courseLayer.stroke()

    // Pin mark
    this.courseLayer.fill({ color: 0xffd166, alpha: 0.9 })
    this.courseLayer.circle(pin.x, pin.y, 6)
    this.courseLayer.fill()

    // Committee boat shape - more boat-like with bow, hull, and stern
    const angle = Math.atan2(pin.y - committee.y, pin.x - committee.x) + Math.PI
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // Boat shape: pointed bow, wider stern
    const s = 0.75
    const hull = [
      { x: 0 * s, y: -16 * s }, // Bow point
      { x: 8 * s, y: -8 * s }, // Bow starboard
      { x: 20 * s, y: 14 * s }, // Stern starboard
      { x: 0 * s, y: 18 * s }, // Stern center
      { x: -20 * s, y: 14 * s }, // Stern port
      { x: -8 * s, y: -8 * s }, // Bow port
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
      hull[3].x,
      hull[3].y,
      hull[4].x,
      hull[4].y,
      hull[5].x,
      hull[5].y,
    ])
    this.courseLayer.fill()
    // Add a mast
    this.courseLayer.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.8 })
    this.courseLayer.moveTo(committee.x, committee.y - 8 * s)
    this.courseLayer.lineTo(committee.x, committee.y + 8 * s)
    this.courseLayer.stroke()

    if (appEnv.debugHud) {
      const dx = committee.x - pin.x
      const dy = committee.y - pin.y
      const len = Math.hypot(dx, dy)
      const midX = (committee.x + pin.x) / 2
      const midY = (committee.y + pin.y) / 2
      const label = new Text({
        text: `Start line: ${len.toFixed(1)}u`,
        style: { fill: '#ffffff', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' },
      })
      label.anchor.set(0.5)
      label.position.set(midX, midY - 18)
      label.alpha = 0.7
      this.overlayLayer.addChild(label)
    }
  }

  // (dashed-line helper removed; solid lines scale and read better under zoom)

  private drawLeewardGate(state: RaceState) {
    const left = state.leewardGate.left
    const right = state.leewardGate.right
    this.courseLayer.setStrokeStyle({ width: 2, color: 0xff6b6b, alpha: 0.8 })
    this.courseLayer.moveTo(left.x, left.y)
    this.courseLayer.lineTo(right.x, right.y)
    ;[left, right].forEach((gateMark) => {
      this.courseLayer.fill({ color: 0xff6b6b, alpha: 0.9 })
      this.courseLayer.circle(gateMark.x, gateMark.y, 7)
      this.courseLayer.fill()
      this.drawZoneCircle(gateMark, MARK_ZONE_RADIUS)
    })
  }

  private drawDebugCrossingGuides(state: RaceState) {
    if (!appEnv.debugHud) return
    const guideColor = 0x32e5ff

    const windward = state.marks[0]
    if (windward) {
      const span = 400
      const start = { x: windward.x - span, y: windward.y }
      const end = { x: windward.x + span, y: windward.y }
      this.drawGuideLine(start, end, 1, guideColor)
    }

    const gateY = (state.leewardGate.left.y + state.leewardGate.right.y) / 2
    const minX = Math.min(state.leewardGate.left.x, state.leewardGate.right.x)
    const maxX = Math.max(state.leewardGate.left.x, state.leewardGate.right.x)
    const gateStart = { x: minX, y: gateY }
    const gateEnd = { x: maxX, y: gateY }
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

  private drawDirectionArrow(
    center: { x: number; y: number },
    direction: 1 | -1,
    color: number,
  ) {
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

  private drawZoneCircle(center: { x: number; y: number }, radiusWorld: number) {
    const radius = radiusWorld
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
    const seen = new Set<string>()
    Object.values(state.boats).forEach((boat) => {
      seen.add(boat.id)
      if (!this.boats.has(boat.id)) {
        const view = new BoatView(boat.color)
        this.boats.set(boat.id, view)
        this.boatLayer.addChild(view.container)
      }
      const isPlayer = boat.id === identity.boatId
      this.boats.get(boat.id)?.update(boat, isPlayer)
    })

    // cleanup
    this.boats.forEach((view, id) => {
      if (seen.has(id)) return
      this.boatLayer.removeChild(view.container)
      this.boats.delete(id)
    })
  }

  private drawHud(state: RaceState) {
    // Phase/time text intentionally hidden (see constructor).
    this.timerText.text = ''
    const shift = state.wind.directionDeg - state.baselineWindDeg
    const shiftText =
      Math.abs(shift) < 0.5
        ? '0'
        : shift > 0
          ? `${shift.toFixed(1)}° R`
          : `${shift.toFixed(1)}° L`
    // Keep string generation only in debug mode (windText is hidden in normal HUD).
    this.windText.text = appEnv.debugHud
      ? `Wind ${state.wind.directionDeg.toFixed(0)}° (${shiftText}) @ ${state.wind.speed.toFixed(1)}kts | cam=${this.cameraMode} x${this.worldLayer.scale.x.toFixed(2)}`
      : ''

    const center = { x: 80, y: 120 }
    const length = 60
    const heading = degToRad(state.wind.directionDeg + 180)
    const tipX = center.x + length * Math.sin(heading)
    const tipY = center.y - length * Math.cos(heading)

    const arrowShift = state.wind.directionDeg - state.baselineWindDeg
    const shiftColor = arrowShift > 1 ? 0xff8f70 : arrowShift < -1 ? 0x70d6ff : 0xffffff

    if (this.windArrow.visible) {
      this.windArrow.clear()
      this.windArrow.setStrokeStyle({ width: 3, color: shiftColor })
      this.windArrow.moveTo(center.x, center.y)
      this.windArrow.lineTo(tipX, tipY)
      this.windArrow.stroke()

      this.windArrowFill.clear()
      this.windArrowFill.fill({ color: shiftColor })
      this.windArrowFill.poly([tipX, tipY, tipX + 8, tipY - 12, tipX - 8, tipY - 12])
      this.windArrowFill.fill()
    }

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

    const overlayWidthRaw = Math.min(stageWidth - 32, 640)
    // Make the countdown overlay ~25% less wide while keeping it centered.
    // Clamp so we never exceed the available width on very small screens.
    const overlayWidth = Math.round(
      Math.min(overlayWidthRaw, Math.max(220, overlayWidthRaw * 0.75)),
    )
    const overlayHeight = Math.min(stageHeight * 0.25, 140)
    const overlayX = (stageWidth - overlayWidth) / 2
    const overlayY = Math.max(16, stageHeight * 0.08)
    const barPadding = 18
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
      this.countdownFill.roundRect(
        barX,
        barY,
        barWidth * percent,
        barHeight,
        barHeight / 2,
      )
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
