import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { useRaceState } from '@/state/hooks'
import { useTheme } from '@/state/themeStore'
import { RaceScene, type CameraMode } from './scene/RaceScene'

type Props = {
  cameraMode: CameraMode
  followBoatId?: string | null
  onPickBoat?: (boatId: string | null, anchorPx?: { x: number; y: number }) => void
  godDragEnabled?: boolean
  onDragBoat?: (boatId: string, worldPos: { x: number; y: number }) => void
  scrollZoom?: boolean
}

export const PixiStage = ({
  cameraMode,
  followBoatId,
  onPickBoat,
  godDragEnabled,
  onDragBoat,
  scrollZoom,
}: Props) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const sceneRef = useRef<RaceScene | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const initialCameraModeRef = useRef<CameraMode>(cameraMode)
  const raceState = useRaceState()
  const raceStateRef = useRef(raceState)
  const onPickBoatRef = useRef<Props['onPickBoat']>(onPickBoat)
  const onDragBoatRef = useRef<Props['onDragBoat']>(onDragBoat)
  const godDragEnabledRef = useRef<boolean>(Boolean(godDragEnabled))
  const scrollZoomRef = useRef<boolean>(Boolean(scrollZoom))
  const { resolved: resolvedTheme } = useTheme()

  useEffect(() => {
    raceStateRef.current = raceState
  }, [raceState])

  useEffect(() => {
    onPickBoatRef.current = onPickBoat
  }, [onPickBoat])

  useEffect(() => {
    onDragBoatRef.current = onDragBoat
  }, [onDragBoat])

  useEffect(() => {
    godDragEnabledRef.current = Boolean(godDragEnabled)
  }, [godDragEnabled])

  useEffect(() => {
    scrollZoomRef.current = Boolean(scrollZoom)
  }, [scrollZoom])

  useEffect(() => {
    if (!mountRef.current) return

    const app = new Application()
    appRef.current = app
    let disposed = false
    let initialized = false

    const init = async () => {
      await app.init({
        resizeTo: mountRef.current ?? undefined,
        backgroundAlpha: 0,
        antialias: true,
      })
      if (disposed) {
        app.destroy(true, { children: true })
        return
      }
      initialized = true

      const canvas = app.canvas as HTMLCanvasElement
      canvasRef.current = canvas
      if (mountRef.current && !mountRef.current.contains(canvas)) {
        mountRef.current.appendChild(canvas)
      }
      sceneRef.current = new RaceScene(app, { cameraMode: initialCameraModeRef.current })
      sceneRef.current.update(raceStateRef.current)

      let draggingBoatId: string | null = null
      let draggingPointerId: number | null = null

      const eventToCanvasPoint = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect()
        // Convert CSS pixel coordinates to canvas internal pixel coordinates.
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1
        const xCanvas = (event.clientX - rect.left) * scaleX
        const yCanvas = (event.clientY - rect.top) * scaleY
        return { xCanvas, yCanvas, rect }
      }

      const handlePointerDown = (event: PointerEvent) => {
        const callback = onPickBoatRef.current
        const { xCanvas, yCanvas, rect } = eventToCanvasPoint(event)

        const picked =
          sceneRef.current?.pickBoatAtCanvasPoint(
            xCanvas,
            yCanvas,
            raceStateRef.current,
          ) ?? null

        if (!picked) {
          callback?.(null)
          return
        }

        const anchorCanvas =
          sceneRef.current?.getBoatCanvasPoint(picked, raceStateRef.current) ?? null
        const anchorCss = anchorCanvas
          ? {
              x: (anchorCanvas.x / canvas.width) * rect.width,
              y: (anchorCanvas.y / canvas.height) * rect.height,
            }
          : undefined

        callback?.(picked, anchorCss)

        // God drag: pointerdown on a boat begins a drag sequence.
        if (!godDragEnabledRef.current || !onDragBoatRef.current) return
        if (event.button !== 0) return
        draggingBoatId = picked
        draggingPointerId = event.pointerId
        try {
          canvas.setPointerCapture(event.pointerId)
        } catch {
          // ignore
        }
      }

      const handlePointerMove = (event: PointerEvent) => {
        const boatId = draggingBoatId
        if (!boatId) return
        if (draggingPointerId !== event.pointerId) return
        const onDrag = onDragBoatRef.current
        if (!onDrag) return
        const { xCanvas, yCanvas } = eventToCanvasPoint(event)
        const world =
          sceneRef.current?.canvasPointToWorld(xCanvas, yCanvas, raceStateRef.current) ??
          null
        if (!world) return
        onDrag(boatId, world)
      }

      const stopDrag = (event: PointerEvent) => {
        if (draggingPointerId !== event.pointerId) return
        draggingBoatId = null
        draggingPointerId = null
        try {
          canvas.releasePointerCapture(event.pointerId)
        } catch {
          // ignore
        }
      }

      const handleWheel = (event: WheelEvent) => {
        if (!scrollZoomRef.current || !sceneRef.current) return
        event.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1
        const canvasX = (event.clientX - rect.left) * scaleX
        const canvasY = (event.clientY - rect.top) * scaleY
        const current = sceneRef.current.getZoomOverride()
        const direction = event.deltaY < 0 ? 1.15 : 1 / 1.15
        sceneRef.current.zoomAtCanvasPoint(canvasX, canvasY, current * direction, raceStateRef.current)
        sceneRef.current.update(raceStateRef.current)
      }

      canvas.addEventListener('pointerdown', handlePointerDown)
      canvas.addEventListener('pointermove', handlePointerMove)
      canvas.addEventListener('pointerup', stopDrag)
      canvas.addEventListener('pointercancel', stopDrag)
      canvas.addEventListener('wheel', handleWheel, { passive: false })

      const ro = new ResizeObserver(() => {
        if (!disposed) app.resize()
      })
      if (mountRef.current) ro.observe(mountRef.current)

      return () => {
        ro.disconnect()
        canvas.removeEventListener('pointerdown', handlePointerDown)
        canvas.removeEventListener('pointermove', handlePointerMove)
        canvas.removeEventListener('pointerup', stopDrag)
        canvas.removeEventListener('pointercancel', stopDrag)
        canvas.removeEventListener('wheel', handleWheel)
      }
    }

    let detachPointer: void | (() => void)
    void init().then((detach) => {
      detachPointer = detach
    })

    return () => {
      disposed = true
      sceneRef.current = null
      canvasRef.current = null
      detachPointer?.()
      if (initialized) {
        app.destroy(true, { children: true })
      }
      appRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.update(raceState)
  }, [raceState])

  useEffect(() => {
    sceneRef.current?.setCameraMode(cameraMode)
    sceneRef.current?.update(raceStateRef.current)
  }, [cameraMode])

  useEffect(() => {
    sceneRef.current?.setFollowBoatId(followBoatId ?? null)
    sceneRef.current?.update(raceStateRef.current)
  }, [followBoatId])

  useEffect(() => {
    sceneRef.current?.setTheme(resolvedTheme)
    sceneRef.current?.update(raceStateRef.current)
  }, [resolvedTheme])

  return <div className="pixi-stage" ref={mountRef} />
}
