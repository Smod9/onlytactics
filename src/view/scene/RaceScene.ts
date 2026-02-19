import { Application, Container, Graphics, Text } from 'pixi.js'
import { appEnv } from '@/config/env'
import type { BoatState, RaceState, Vec2, WindFieldConfig } from '@/types/race'
import { identity } from '@/net/identity'
import { angleDiff } from '@/logic/physics'
import { getWindFieldConfig, sampleWindDeltaKts } from '@/logic/windField'
import {
  BOAT_BOW_OFFSET,
  BOAT_BOW_RADIUS,
  BOAT_LENGTH,
  BOAT_STERN_OFFSET,
  BOAT_STERN_RADIUS,
  GATE_COLLIDER_RADIUS,
  MARK_COLLIDER_RADIUS,
  NO_GO_ANGLE_DEG,
  STALL_DURATION_S,
  WAKE_FORWARD_OFFSET_MAX,
  WAKE_GRID_ENABLED,
  WAKE_MAX_SLOWDOWN,
} from '@/logic/constants'
import { getEffectiveWakeTuning } from '@/logic/wakeTuning'
import { boatCapsuleCircles } from '@/logic/boatGeometry'
import { raceStore } from '@/state/raceStore'
import {
  courseLegs,
  courseMarkAnnotations,
  radialSets,
  gateRadials,
} from '@/config/course'
import { createShadowStampAtlas, getStampForWindDir, type ShadowStampAtlas } from '@/logic/shadowStamps'
import {
  createWindShadowGrid,
  computeCourseBounds,
  clearGrid,
  blitStamp,
  isLeewardOnPort,
  type WindShadowGrid,
} from '@/logic/windShadowGrid'

const degToRad = (deg: number) => (deg * Math.PI) / 180
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const normalizeDeg = (deg: number) => {
  const wrapped = deg % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}
const rotateVec = (vec: Vec2, deg: number) => {
  const rad = degToRad(deg)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: vec.x * cos - vec.y * sin, y: vec.x * sin + vec.y * cos }
}
const wakeForwardOffset = (headingDeg: number, windDirDeg: number) => {
  const absTwa = Math.abs(angleDiff(headingDeg, windDirDeg))
  const downwindT = clamp01((absTwa - 110) / 50)
  return WAKE_FORWARD_OFFSET_MAX * downwindT
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

  private lastLeewardSign: 1 | -1 = 1
  private lastNameText = ''
  private lastNameFill = '#ffffff'
  private lastProjectionLen = NaN

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
    // Port/starboard edge colors
    this.hull.setStrokeStyle({ width: 3, color: 0x00c389 })
    this.hull.moveTo(0, -20)
    this.hull.lineTo(10, 10)
    this.hull.stroke()
    this.hull.setStrokeStyle({ width: 3, color: 0xff5e5e })
    this.hull.moveTo(-10, 10)
    this.hull.lineTo(0, -20)
    this.hull.stroke()
    this.hull.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.4 })
    this.hull.moveTo(-10, 10)
    this.hull.lineTo(10, 10)
    this.hull.stroke()
    this.sail.position.set(0, -20)
    this.sail.pivot.set(0, 0)
    // Draw the sail once (starboard/positive-x side) and mirror it via scale per-frame.
    this.drawSailShape()
    this.sail.scale.set(1, 1)
  }

  private drawSailShape() {
    this.sail.clear()
    this.sail.fill({ color: 0xffffff, alpha: 0.65 })
    // Bow tack
    this.sail.moveTo(0, 0)

    // Clew (foot angle)
    this.sail.lineTo(25, 38)

    // Smooth leech curve: control point halfway up, curved inwards
    this.sail.quadraticCurveTo(
      32,
      4, // control point
      10,
      0, // head of the sail, slightly forward
    )

    this.sail.closePath()
    this.sail.fill()
  }

  update(boat: BoatState, isPlayer = false) {
    this.container.position.set(boat.pos.x, boat.pos.y)
    this.container.rotation = degToRad(boat.headingDeg)
    const awa = angleDiff(RaceScene.currentWindDeg, boat.headingDeg)
    const leewardSign: 1 | -1 = awa >= 0 ? -1 : 1
    if (leewardSign !== this.lastLeewardSign) {
      this.sail.scale.x = leewardSign
      this.lastLeewardSign = leewardSign
    }
    const absAwa = Math.abs(angleDiff(boat.headingDeg, RaceScene.currentWindDeg))
    // NOTE: Our sail geometry starts fairly "eased" at 0° rotation, and rotating it
    // pulls it closer to centerline (more trimmed in). So: upwind (small AWA) => more
    // rotation, downwind (large AWA) => less rotation.
    const easedFactor = Math.min(1, absAwa / 140)
    const trimmedInFactor = 1 - easedFactor
    // Keep rotation direction consistent with the original implementation:
    // rotate the sail toward centerline on each tack.
    const isBlown = Boolean(boat.blowSails)
    // Ease the sail a bit more at very deep downwind angles.
    // Previously our minimum trim-in was ~8° even at 180°; make that ~50% more eased (~4°)
    // by ramping the minimum between 140° → 180°.
    const deepDownwindT = clamp01((absAwa - 140) / 40)
    const minRotationDeg = 8 + (4 - 8) * deepDownwindT
    const baseRotationDeg = leewardSign * (minRotationDeg + trimmedInFactor * 24)

    // Unified "luffing" animation intensity:
    // - 100% when blown (player holding L)
    // - Otherwise ramps up only when you're near the no-go zone (true luffing / stalled),
    //   not during normal upwind sailing (e.g. VMG ~45°).
    const LUFF_BUFFER_DEG = 12
    const luffThresholdDeg = NO_GO_ANGLE_DEG + LUFF_BUFFER_DEG
    const nearNoGoIntensity = clamp01((luffThresholdDeg - absAwa) / LUFF_BUFFER_DEG)
    const stallIntensity = clamp01(boat.stallTimer / STALL_DURATION_S)
    const luffIntensity = isBlown ? 1 : Math.max(nearNoGoIntensity, stallIntensity)

    // Luffing visuals:
    // - If blown: sail is fully eased out (0°) + wiggle.
    // - If merely luffing: keep sail TRIMMED, but wiggle/flap around that trimmed angle.
    // Suppress wiggle in VMG mode unless the user is actively blowing sails (L held).
    const wiggleAllowed = !boat.vmgMode || isBlown
    const wiggleDeg = wiggleAllowed
      ? Math.sin(performance.now() / 70) * 6 * luffIntensity
      : 0
    const rotationDeg = isBlown
      ? leewardSign * wiggleDeg
      : baseRotationDeg + leewardSign * wiggleDeg
    this.sail.rotation = degToRad(rotationDeg)
    // Keep sail fully opaque when just luffing; only de-emphasize when fully blown.
    this.sail.alpha = isBlown ? 0.75 : 1

    const nameSuffix: string[] = []
    if (boat.penalties) nameSuffix.push(`(${boat.penalties})`)
    if (boat.overEarly) nameSuffix.push('OCS')
    const nextNameText = nameSuffix.length
      ? `${boat.name} ${nameSuffix.join(' ')}`
      : boat.name
    if (nextNameText !== this.lastNameText) {
      this.nameTag.text = nextNameText
      this.lastNameText = nextNameText
    }
    const nextFill =
      boat.overEarly || boat.fouled || boat.penalties > 0 ? '#ff6b6b' : '#ffffff'
    if (nextFill !== this.lastNameFill) {
      this.nameTag.style.fill = nextFill
      this.lastNameFill = nextFill
    }

    if (boat.fouled) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 100)
      this.hull.alpha = 0.4 + 0.6 * pulse
      this.hull.tint = 0xff4444
    } else {
      this.hull.alpha = 1
      this.hull.tint = 0xffffff
    }

    this.drawProjection(isPlayer)
    this.updateWakeIndicator(boat)
  }

  private updateWakeIndicator(boat: BoatState) {
    const wake = getEffectiveWakeTuning()
    const wakeFactor = boat.wakeFactor ?? 1
    const isAffected = wakeFactor < 0.995
    const showIndicator = appEnv.debugHud && isAffected

    this.wakeIndicator.visible = showIndicator
    this.wakeLabel.visible = showIndicator

    if (showIndicator) {
      const slowdown = 1 - wakeFactor
      const slowdownPercent = Math.round(slowdown * 100)
      const intensity = Math.min(1, slowdown / wake.maxSlowdown)

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

  private drawProjection(isPlayer: boolean) {
    // Only show this guidance line for "our boat".
    if (!isPlayer) {
      if (this.lastProjectionLen !== 0) {
        this.lastProjectionLen = 0
        this.projection.clear()
      }
      return
    }

    // Fixed in world units: 3x previous length (was 2 * BOAT_LENGTH) => 6 boat lengths.
    const length = 6 * BOAT_LENGTH
    if (this.lastProjectionLen === length) return
    this.lastProjectionLen = length

    this.projection.clear()
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
  private windShadowLayer = new Graphics()
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
  private lastCourseKey: string | null = null
  private lastCourseWasDebug = false
  private windFieldTick = 0
  private windFieldWasEnabled = false
  private gridHeatmapTick = 0
  private windShadowLeewardBlend = 0
  private windShadowLastMs = 0
  private readonly windFieldBuckets = 6
  private windFieldPuffRects: number[][] = Array.from(
    { length: this.windFieldBuckets },
    () => [],
  )
  private windFieldLullRects: number[][] = Array.from(
    { length: this.windFieldBuckets },
    () => [],
  )
  private readonly windFieldCenter: Vec2 = { x: 0, y: 0 }

  // Grid-based wind shadow visualization
  private shadowStampAtlas?: ShadowStampAtlas
  private windShadowGridViz?: WindShadowGrid
  private windShadowGridLayer = new Graphics()
  private gridVizInitialized = false

  constructor(
    private app: Application,
    options?: {
      cameraMode?: CameraMode
    },
  ) {
    // Render order (bottom -> top):
    // - windFieldLayer: moving puffs/lulls visualization (world-space)
    // - windShadowGridLayer: grid-based wind shadow heatmap (debug, world-space)
    // - windShadowLayer: player wind shadow visualization (world-space)
    // - courseLayer: static course visuals (kept above wind shadows for readability)
    // - contextLayer: follow-mode guidance line(s)
    // - overlayLayer: debug overlays
    // - boatLayer: boats + name tags, etc.
    this.worldLayer.addChild(
      this.windFieldLayer,
      this.windShadowGridLayer,
      this.windShadowLayer,
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
    // Wind field is visually "slow moving"; redraw every 3rd update to reduce CPU/GPU churn.
    const windCfg = getWindFieldConfig(state)
    if (!windCfg) {
      if (this.windFieldWasEnabled) {
        this.windFieldLayer.clear()
      }
      this.windFieldWasEnabled = false
      this.windFieldTick = 0
    } else {
      this.windFieldWasEnabled = true
      if (this.windFieldTick % 3 === 0) {
        this.drawWindField(state, windCfg)
      }
      this.windFieldTick += 1
    }
    this.drawPlayerWindShadow(state)
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

  private drawWindField(state: RaceState, cfg?: WindFieldConfig) {
    const resolved = cfg ?? getWindFieldConfig(state)
    this.windFieldLayer.clear()
    if (!resolved) return

    const { minX, maxX, minY, maxY } = this.getVisibleWorldBounds(state)

    // Dynamic tile sizing to keep draw calls bounded.
    const maxTiles = 1800
    let tile = Math.max(6, resolved.tileSizeWorld)
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
    const buckets = this.windFieldBuckets
    const puffRects = this.windFieldPuffRects
    const lullRects = this.windFieldLullRects
    for (let b = 0; b < buckets; b += 1) {
      puffRects[b].length = 0
      lullRects[b].length = 0
    }
    const minNormToDraw = 0.07

    for (let y = startY; y < endY; y += tile) {
      for (let x = startX; x < endX; x += tile) {
        const center = this.windFieldCenter
        center.x = x + tile / 2
        center.y = y + tile / 2
        const delta = sampleWindDeltaKts(state, center)
        if (!delta) continue
        const norm = Math.abs(delta) / Math.max(0.001, resolved.intensityKts)
        if (norm < minNormToDraw) continue
        const b = Math.min(buckets - 1, Math.floor(norm * buckets))
        const list = delta > 0 ? puffRects[b] : lullRects[b]
        list.push(x, y, tile, tile)
      }
    }

    const puffColor = 0x19d3c5 // teal
    const lullColor = 0xb07aa1 // deep blue
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

  private getCourseKey(state: RaceState): string {
    const parts: string[] = []
    const push = (p: Vec2) => {
      // Course geometry is effectively static; round to avoid accidental redraws from tiny float noise.
      parts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    }
    state.marks.forEach(push)
    push(state.startLine.pin)
    push(state.startLine.committee)
    push(state.leewardGate.left)
    push(state.leewardGate.right)
    return parts.join('|')
  }

  private drawCourse(state: RaceState) {
    const debug = appEnv.debugHud

    // Always draw wind shadow (player's own in normal mode, all boats in debug mode)
    // Throttle to every 3rd update (same cadence as wind field) to reduce GPU churn.
    if (WAKE_GRID_ENABLED) {
      if (this.gridHeatmapTick % 3 === 0) {
        this.drawWindShadowGridHeatmap(state)
      }
      this.gridHeatmapTick += 1
    }

    if (!debug) {
      const prevWasDebug = this.lastCourseWasDebug
      const key = this.getCourseKey(state)
      if (!this.lastCourseWasDebug && key === this.lastCourseKey) return
      this.lastCourseKey = key
      this.lastCourseWasDebug = false

      // If we previously drew debug overlays, clear them when debug is off.
      // (Debug overlays live in overlayLayer and won't be refreshed otherwise.)
      if (prevWasDebug) {
        this.overlayLayer.removeChildren()
      }

      this.courseLayer.clear()
      this.drawStartLine(state)
      this.drawMarks(state)
      this.drawLeewardGate(state)
      return
    }

    // In debug mode, redraw every tick since we draw stateful annotations/guides.
    this.lastCourseWasDebug = true
    this.lastCourseKey = this.getCourseKey(state)

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

    // Old trig visualization only in debug mode (grid viz is handled in drawCourse)
    if (!WAKE_GRID_ENABLED && appEnv.debugHud) {
      this.drawWindShadowsDebug(state)
    }

    this.drawMarkRadials(state)
    this.drawMarkLabels(state)
    this.drawNextMarkHighlight(state)
    this.drawCrossingMarkers(state)
    this.drawCollisionDebug(state)
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

  private getLeewardSideSign(
    boatHeadingDeg: number,
    windDirDeg: number,
    downwindVec: Vec2,
  ): 1 | -1 {
    const awa = angleDiff(boatHeadingDeg, windDirDeg)
    const headingRad = degToRad(boatHeadingDeg)
    const headingVec = { x: Math.sin(headingRad), y: -Math.cos(headingRad) }
    const leewardVec =
      awa >= 0
        ? { x: -headingVec.y, y: headingVec.x }
        : { x: headingVec.y, y: -headingVec.x }
    const leewardCross = downwindVec.x * leewardVec.y - downwindVec.y * leewardVec.x
    return leewardCross >= 0 ? 1 : -1
  }

  private drawPlayerWindShadow(state: RaceState) {
    this.windShadowLayer.clear()

    // Skip old trig-based visualization when grid mode is enabled
    if (WAKE_GRID_ENABLED) {
      // console.log('[drawPlayerWindShadow] Grid mode enabled, skipping old visualization')
      return
    }

    const boat = state.boats[identity.boatId]
    if (!boat) return

    const wake = getEffectiveWakeTuning()
    const windDownwindDeg = normalizeDeg(state.wind.directionDeg + 180)
    const windDownRad = degToRad(windDownwindDeg)
    const windDownDir = { x: Math.sin(windDownRad), y: -Math.cos(windDownRad) }

    const leewardSideSign = this.getLeewardSideSign(
      boat.headingDeg,
      state.wind.directionDeg,
      windDownDir,
    )
    const twa = angleDiff(boat.headingDeg, state.wind.directionDeg)
    const nowMs = performance.now()
    const dt = this.windShadowLastMs > 0 ? (nowMs - this.windShadowLastMs) / 1000 : 0
    this.windShadowLastMs = nowMs
    const blendT = clamp01(dt * 6)
    this.windShadowLeewardBlend +=
      (leewardSideSign - this.windShadowLeewardBlend) * blendT
    const leewardWeight = (this.windShadowLeewardBlend + 1) / 2
    const absTwa = Math.abs(twa)
    const downwindT = clamp01((absTwa - 110) / 50)
    const biasDeg = this.windShadowLeewardBlend * wake.biasDeg
    const rotScale =
      wake.twaRotationScaleUpwind +
      (wake.twaRotationScaleDownwind - wake.twaRotationScaleUpwind) * downwindT
    const dir = rotateVec(windDownDir, twa * rotScale + biasDeg)
    const cross = { x: -dir.y, y: dir.x }
    const coreToTurbRatio =
      Math.tan(degToRad(wake.coreHalfAngleDeg)) /
      Math.tan(degToRad(wake.turbHalfAngleDeg))
    const widthAt = (t: number, sideMult: number) => {
      const baseWidth =
        wake.widthEnd +
        (wake.widthStart - wake.widthEnd) * Math.pow(1 - t, wake.widthCurve)
      return baseWidth * sideMult
    }
    const leftWidthAt = (t: number) => {
      const leeward = widthAt(t, wake.leewardWidthMult)
      const windward = widthAt(t, wake.windwardWidthMult)
      return windward + (leeward - windward) * leewardWeight
    }
    const rightWidthAt = (t: number) => {
      const leeward = widthAt(t, wake.leewardWidthMult)
      const windward = widthAt(t, wake.windwardWidthMult)
      return windward + (leeward - windward) * (1 - leewardWeight)
    }

    const headingRad = degToRad(boat.headingDeg)
    const headingVec = { x: Math.sin(headingRad), y: -Math.cos(headingRad) }
    const forwardOffset = wakeForwardOffset(boat.headingDeg, state.wind.directionDeg)
    const basePos = {
      x: boat.pos.x + headingVec.x * forwardOffset,
      y: boat.pos.y + headingVec.y * forwardOffset,
    }

    const drawZone = (widthScale: number, baseAlpha: number) => {
      const slices = 14
      const featherScales = [1, 1.18, 1.32]
      const featherAlpha = [1, 0.45, 0.25]
      for (let i = 0; i < slices; i += 1) {
        const t0 = i / slices
        const t1 = (i + 1) / slices
        const startCenter = {
          x: basePos.x + dir.x * wake.length * t0,
          y: basePos.y + dir.y * wake.length * t0,
        }
        const endCenter = {
          x: basePos.x + dir.x * wake.length * t1,
          y: basePos.y + dir.y * wake.length * t1,
        }
        const fade = Math.pow(1 - t0, 1.6)
        for (let s = 0; s < featherScales.length; s += 1) {
          const scale = widthScale * featherScales[s]
          const leftW0 = leftWidthAt(t0) * scale
          const leftW1 = leftWidthAt(t1) * scale
          const rightW0 = rightWidthAt(t0) * scale
          const rightW1 = rightWidthAt(t1) * scale

          const startLeft = {
            x: startCenter.x + cross.x * leftW0,
            y: startCenter.y + cross.y * leftW0,
          }
          const startRight = {
            x: startCenter.x - cross.x * rightW0,
            y: startCenter.y - cross.y * rightW0,
          }
          const endLeft = {
            x: endCenter.x + cross.x * leftW1,
            y: endCenter.y + cross.y * leftW1,
          }
          const endRight = {
            x: endCenter.x - cross.x * rightW1,
            y: endCenter.y - cross.y * rightW1,
          }

          const alpha = baseAlpha * featherAlpha[s] * fade + 0.01
          this.windShadowLayer.fill({ color: 0x6aaeff, alpha })
          this.windShadowLayer.moveTo(startLeft.x, startLeft.y)
          this.windShadowLayer.lineTo(endLeft.x, endLeft.y)
          this.windShadowLayer.lineTo(endRight.x, endRight.y)
          this.windShadowLayer.lineTo(startRight.x, startRight.y)
          this.windShadowLayer.closePath()
          this.windShadowLayer.fill()
        }
      }
    }

    drawZone(1, 0.12)
    drawZone(coreToTurbRatio, 0.2)
  }

  private drawWindShadowsDebug(state: RaceState) {
    const wake = getEffectiveWakeTuning()
    const windDownwindDeg = normalizeDeg(state.wind.directionDeg + 180)
    const windDownRad = degToRad(windDownwindDeg)
    const windDownDir = { x: Math.sin(windDownRad), y: -Math.cos(windDownRad) }
    const maxSideMult = Math.max(wake.leewardWidthMult, wake.windwardWidthMult)
    const maxHalfWidth = Math.max(wake.widthStart, wake.widthEnd) * maxSideMult
    const coreToTurbRatio =
      Math.tan(degToRad(wake.coreHalfAngleDeg)) /
      Math.tan(degToRad(wake.turbHalfAngleDeg))
    const widthAt = (t: number, sideMult: number) => {
      const baseWidth =
        wake.widthEnd +
        (wake.widthStart - wake.widthEnd) * Math.pow(1 - t, wake.widthCurve)
      return baseWidth * sideMult
    }

    const wakeDirs = new Map<
      string,
      {
        dir: Vec2
        cross: Vec2
        leewardSideSign: 1 | -1
        origin: Vec2
      }
    >()
    Object.values(state.boats).forEach((boat) => {
      const leewardSideSign = this.getLeewardSideSign(
        boat.headingDeg,
        state.wind.directionDeg,
        windDownDir,
      )
      const twa = angleDiff(boat.headingDeg, state.wind.directionDeg)
      const absTwa = Math.abs(twa)
      const downwindT = clamp01((absTwa - 110) / 50)
      const biasDeg = leewardSideSign * wake.biasDeg
      const rotScale =
        wake.twaRotationScaleUpwind +
        (wake.twaRotationScaleDownwind - wake.twaRotationScaleUpwind) * downwindT
      const dir = rotateVec(windDownDir, twa * rotScale + biasDeg)
      const cross = { x: -dir.y, y: dir.x }
      const headingRad = degToRad(boat.headingDeg)
      const headingVec = { x: Math.sin(headingRad), y: -Math.cos(headingRad) }
      const forwardOffset = wakeForwardOffset(boat.headingDeg, state.wind.directionDeg)
      const origin = {
        x: boat.pos.x + headingVec.x * forwardOffset,
        y: boat.pos.y + headingVec.y * forwardOffset,
      }
      wakeDirs.set(boat.id, { dir, cross, leewardSideSign, origin })
    })

    // Check which boats are actually affecting others (for intensity visualization)
    const boatsAffectingOthers = new Set<string>()
    Object.values(state.boats).forEach((target) => {
      const targetFactor = target.wakeFactor ?? 1
      if (targetFactor < 0.995) {
        // This boat is being affected, find which boats are affecting it
        Object.values(state.boats).forEach((source) => {
          if (source.id === target.id) return
          const wakeDir = wakeDirs.get(source.id)
          if (!wakeDir) return
          const dx = target.pos.x - wakeDir.origin.x
          const dy = target.pos.y - wakeDir.origin.y
          const distSq = dx * dx + dy * dy
          if (distSq === 0 || distSq > (wake.length + maxHalfWidth * 2) ** 2) return

          const dist = Math.sqrt(distSq)
          const relUnitX = dx / dist
          const relUnitY = dy / dist
          const align = relUnitX * wakeDir.dir.x + relUnitY * wakeDir.dir.y
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
      const wakeDir = wakeDirs.get(boat.id)
      if (!wakeDir) return

      // Always show in debug mode, or show when actually affecting others
      if (!appEnv.debugHud && !isAffectingOthers) return

      const startCenter = wakeDir.origin
      const endCenter = {
        x: wakeDir.origin.x + wakeDir.dir.x * wake.length,
        y: wakeDir.origin.y + wakeDir.dir.y * wake.length,
      }

      const leftWidthStart = widthAt(
        0,
        wakeDir.leewardSideSign > 0 ? wake.leewardWidthMult : wake.windwardWidthMult,
      )
      const rightWidthStart = widthAt(
        0,
        wakeDir.leewardSideSign < 0 ? wake.leewardWidthMult : wake.windwardWidthMult,
      )
      const leftWidthEnd = widthAt(
        1,
        wakeDir.leewardSideSign > 0 ? wake.leewardWidthMult : wake.windwardWidthMult,
      )
      const rightWidthEnd = widthAt(
        1,
        wakeDir.leewardSideSign < 0 ? wake.leewardWidthMult : wake.windwardWidthMult,
      )

      const startLeft = {
        x: startCenter.x + wakeDir.cross.x * leftWidthStart,
        y: startCenter.y + wakeDir.cross.y * leftWidthStart,
      }
      const startRight = {
        x: startCenter.x - wakeDir.cross.x * rightWidthStart,
        y: startCenter.y - wakeDir.cross.y * rightWidthStart,
      }
      const endLeft = {
        x: endCenter.x + wakeDir.cross.x * leftWidthEnd,
        y: endCenter.y + wakeDir.cross.y * leftWidthEnd,
      }
      const endRight = {
        x: endCenter.x - wakeDir.cross.x * rightWidthEnd,
        y: endCenter.y - wakeDir.cross.y * rightWidthEnd,
      }

      // Make visualization more visible when actually affecting others
      const fillAlpha = isAffectingOthers ? 0.12 : 0.04
      const strokeAlpha = isAffectingOthers ? 0.35 : 0.12

      const gTurb = new Graphics()
      gTurb.setStrokeStyle({ width: 1.5, color: 0x6aaeff, alpha: strokeAlpha })
      gTurb.fill({ color: 0x6aaeff, alpha: fillAlpha })

      const pts = [startLeft, endLeft, endRight, startRight]
      gTurb.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach((p) => gTurb.lineTo(p.x, p.y))
      gTurb.closePath()
      gTurb.fill()
      gTurb.stroke()

      const gCore = new Graphics()
      gCore.fill({ color: 0x6aaeff, alpha: fillAlpha + 0.08 })
      const coreStartLeft = {
        x: startCenter.x + wakeDir.cross.x * leftWidthStart * coreToTurbRatio,
        y: startCenter.y + wakeDir.cross.y * leftWidthStart * coreToTurbRatio,
      }
      const coreStartRight = {
        x: startCenter.x - wakeDir.cross.x * rightWidthStart * coreToTurbRatio,
        y: startCenter.y - wakeDir.cross.y * rightWidthStart * coreToTurbRatio,
      }
      const coreEndLeft = {
        x: endCenter.x + wakeDir.cross.x * leftWidthEnd * coreToTurbRatio,
        y: endCenter.y + wakeDir.cross.y * leftWidthEnd * coreToTurbRatio,
      }
      const coreEndRight = {
        x: endCenter.x - wakeDir.cross.x * rightWidthEnd * coreToTurbRatio,
        y: endCenter.y - wakeDir.cross.y * rightWidthEnd * coreToTurbRatio,
      }
      const corePts = [coreStartLeft, coreEndLeft, coreEndRight, coreStartRight]
      gCore.moveTo(corePts[0].x, corePts[0].y)
      corePts.slice(1).forEach((p) => gCore.lineTo(p.x, p.y))
      gCore.closePath()
      gCore.fill()

      // Outline the cone edges for clarity (only when affecting others)
      if (isAffectingOthers) {
        const coneEdgeLeft = new Graphics()
        coneEdgeLeft.setStrokeStyle({ width: 1, color: 0x6aaeff, alpha: 0.3 })
        coneEdgeLeft.moveTo(startCenter.x, startCenter.y)
        coneEdgeLeft.lineTo(endLeft.x, endLeft.y)
        coneEdgeLeft.stroke()

        const coneEdgeRight = new Graphics()
        coneEdgeRight.setStrokeStyle({ width: 1, color: 0x6aaeff, alpha: 0.3 })
        coneEdgeRight.moveTo(startCenter.x, startCenter.y)
        coneEdgeRight.lineTo(endRight.x, endRight.y)
        coneEdgeRight.stroke()

        this.overlayLayer.addChild(gTurb, gCore, coneEdgeLeft, coneEdgeRight)
      } else {
        this.overlayLayer.addChild(gTurb, gCore)
      }
    })
  }

  /**
   * Draw a heatmap visualization of the grid-based wind shadow system.
   * This computes the grid client-side for visualization only.
   */
  private drawWindShadowGridHeatmap(state: RaceState) {
    this.windShadowGridLayer.clear()

    // Initialize grid infrastructure lazily
    if (!this.gridVizInitialized) {
      this.shadowStampAtlas = createShadowStampAtlas()
      const bounds = computeCourseBounds(state)
      this.windShadowGridViz = createWindShadowGrid(bounds)
      this.gridVizInitialized = true
    }

    if (!this.windShadowGridViz || !this.shadowStampAtlas) return

    // Expand grid if boats are outside bounds
    this.expandVizGridIfNeeded(state)

    const grid = this.windShadowGridViz

    // Clear and recompute grid
    clearGrid(grid)

    // Get stamp for current wind direction
    const stamp = getStampForWindDir(this.shadowStampAtlas, state.wind.directionDeg)
    const windDirDeg = state.wind.directionDeg

    // In debug mode, show all boats' shadows
    // In normal mode, only show the local player's shadow
    const allBoats = Object.values(state.boats)
    const boatsToShow = appEnv.debugHud
      ? allBoats
      : allBoats.filter((b) => b.id === identity.boatId)

    // Blit shadow for each boat, flipping based on their tack
    boatsToShow.forEach((boat) => {
      // Flip if leeward is on port side (template has leeward on right/starboard)
      const flipHorizontal = isLeewardOnPort(boat.headingDeg, windDirDeg)
      blitStamp(grid, stamp, boat.pos.x, boat.pos.y, flipHorizontal)
    })

    // Draw heatmap - only cells with significant shadow
    const minIntensity = 0.01 // Skip very faint cells
    const g = this.windShadowGridLayer

    // Down-sample visualization if grid is too large (prevents Pixi.js overload)
    // Aim for max ~10000 cells drawn
    const totalCells = grid.width * grid.height
    const maxDrawnCells = 10000
    const skipFactor = totalCells > maxDrawnCells ? Math.ceil(Math.sqrt(totalCells / maxDrawnCells)) : 1
    const drawCellSize = grid.cellSize * skipFactor

    for (let cy = 0; cy < grid.height; cy += skipFactor) {
      for (let cx = 0; cx < grid.width; cx += skipFactor) {
        // Sample the center of the drawn cell (or average nearby cells)
        let intensity = 0
        let samples = 0
        for (let sy = 0; sy < skipFactor && cy + sy < grid.height; sy++) {
          for (let sx = 0; sx < skipFactor && cx + sx < grid.width; sx++) {
            intensity += grid.data[(cy + sy) * grid.width + (cx + sx)]
            samples++
          }
        }
        intensity = samples > 0 ? intensity / samples : 0

        if (intensity < minIntensity) continue

        // World position of cell
        const worldX = grid.originX + cx * grid.cellSize
        const worldY = grid.originY + cy * grid.cellSize

        // Color: blue to red based on intensity
        // Normalize intensity to 0-1 range based on max slowdown
        const normalizedIntensity = Math.min(1, intensity / WAKE_MAX_SLOWDOWN)

        // Interpolate from blue (low) to red (high)
        const r = Math.floor(normalizedIntensity * 255)
        const b = Math.floor((1 - normalizedIntensity) * 255)
        const color = (r << 16) | b

        // Alpha increases with intensity for better visibility
        const alpha = 0.1 + normalizedIntensity * 0.4

        g.fill({ color, alpha })
        g.rect(worldX, worldY, drawCellSize, drawCellSize)
        g.fill()
      }
    }
  }

  /**
   * Expand the visualization grid if boats are outside bounds.
   */
  private expandVizGridIfNeeded(state: RaceState): void {
    if (!this.windShadowGridViz) return

    const grid = this.windShadowGridViz
    const padding = 100

    let needsExpansion = false
    let newMinX = grid.originX
    let newMaxX = grid.originX + grid.width * grid.cellSize
    let newMinY = grid.originY
    let newMaxY = grid.originY + grid.height * grid.cellSize

    for (const boat of Object.values(state.boats)) {
      if (boat.pos.x < grid.originX + padding) {
        newMinX = Math.min(newMinX, boat.pos.x - padding * 2)
        needsExpansion = true
      }
      if (boat.pos.x > grid.originX + grid.width * grid.cellSize - padding) {
        newMaxX = Math.max(newMaxX, boat.pos.x + padding * 2)
        needsExpansion = true
      }
      if (boat.pos.y < grid.originY + padding) {
        newMinY = Math.min(newMinY, boat.pos.y - padding * 2)
        needsExpansion = true
      }
      if (boat.pos.y > grid.originY + grid.height * grid.cellSize - padding) {
        newMaxY = Math.max(newMaxY, boat.pos.y + padding * 2)
        needsExpansion = true
      }
    }

    if (needsExpansion) {
      this.windShadowGridViz = createWindShadowGrid({
        minX: newMinX,
        maxX: newMaxX,
        minY: newMinY,
        maxY: newMaxY,
      })
    }
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

  private drawCollisionDebug(state: RaceState) {
    const gateIndices = new Set<number>()
    courseLegs.forEach((leg) => {
      if (leg.kind === 'gate' && leg.gateMarkIndices) {
        gateIndices.add(leg.gateMarkIndices[0])
        gateIndices.add(leg.gateMarkIndices[1])
      }
    })

    const markOverlay = new Graphics()
    markOverlay.setStrokeStyle({ width: 1, color: 0xffa53a, alpha: 0.5 })
    state.marks.forEach((mark, index) => {
      const radius = gateIndices.has(index) ? GATE_COLLIDER_RADIUS : MARK_COLLIDER_RADIUS
      markOverlay.circle(mark.x, mark.y, radius)
    })
    markOverlay.stroke()

    const boatOverlay = new Graphics()
    boatOverlay.setStrokeStyle({ width: 1, color: 0x24e5ff, alpha: 0.55 })
    Object.values(state.boats).forEach((boat) => {
      const circles = boatCapsuleCircles(boat)
      circles.forEach((circle) => {
        boatOverlay.circle(circle.x, circle.y, circle.r)
      })
    })
    boatOverlay.stroke()

    this.overlayLayer.addChild(markOverlay, boatOverlay)
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
