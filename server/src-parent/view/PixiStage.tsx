import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { useRaceState } from '@/state/hooks'
import { RaceScene } from './scene/RaceScene'

export const PixiStage = () => {
  const mountRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const sceneRef = useRef<RaceScene | null>(null)
  const raceState = useRaceState()
  const raceStateRef = useRef(raceState)

  useEffect(() => {
    raceStateRef.current = raceState
  }, [raceState])

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
      if (mountRef.current && !mountRef.current.contains(app.canvas)) {
        mountRef.current.appendChild(app.canvas)
      }
      sceneRef.current = new RaceScene(app)
      sceneRef.current.update(raceStateRef.current)
    }

    void init()

    return () => {
      disposed = true
      sceneRef.current = null
      if (initialized) {
        app.destroy(true, { children: true })
      }
      appRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.update(raceState)
  }, [raceState])

  return <div className="pixi-stage" ref={mountRef} />
}

