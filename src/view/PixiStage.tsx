import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { useRaceState } from '@/state/hooks'
import { RaceScene, type CameraMode } from './scene/RaceScene'

type Props = {
  cameraMode: CameraMode
  followBoatId?: string | null
  onPickBoat?: (boatId: string | null, anchorPx?: { x: number; y: number }) => void
}

export const PixiStage = ({ cameraMode, followBoatId, onPickBoat }: Props) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const sceneRef = useRef<RaceScene | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const initialCameraModeRef = useRef<CameraMode>(cameraMode)
  const raceState = useRaceState()
  const raceStateRef = useRef(raceState)
  const onPickBoatRef = useRef<Props['onPickBoat']>(onPickBoat)

  useEffect(() => {
    raceStateRef.current = raceState
  }, [raceState])

  useEffect(() => {
    onPickBoatRef.current = onPickBoat
  }, [onPickBoat])

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

      const handlePointerDown = (event: PointerEvent) => {
        const callback = onPickBoatRef.current
        if (!callback) return
        const rect = canvas.getBoundingClientRect()
        // Convert CSS pixel coordinates to canvas internal pixel coordinates.
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1
        const xCanvas = (event.clientX - rect.left) * scaleX
        const yCanvas = (event.clientY - rect.top) * scaleY

        const picked =
          sceneRef.current?.pickBoatAtCanvasPoint(xCanvas, yCanvas, raceStateRef.current) ?? null

        if (!picked) {
          callback(null)
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

        callback(picked, anchorCss)
      }

      canvas.addEventListener('pointerdown', handlePointerDown)
      return () => canvas.removeEventListener('pointerdown', handlePointerDown)
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
  }, [cameraMode])

  useEffect(() => {
    sceneRef.current?.setFollowBoatId(followBoatId ?? null)
  }, [followBoatId])

  return <div className="pixi-stage" ref={mountRef} />
}

