import { useEffect, useRef } from 'react'
import { createPhaserGame, type PhaserGameHandle } from '@/game/phaserGame'
import { useRaceState } from '@/state/hooks'

export const PhaserStage = () => {
  const mountRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<PhaserGameHandle | null>(null)
  const raceState = useRaceState()
  const stateRef = useRef(raceState)

  useEffect(() => {
    stateRef.current = raceState
    handleRef.current?.scene?.setRaceState(raceState)
  }, [raceState])

  useEffect(() => {
    if (!mountRef.current) return

    const handle = createPhaserGame(mountRef.current)
    handleRef.current = handle
    handle.onReady((scene) => {
      if (import.meta.env.DEV) {
        console.debug('[phaser-stage] scene ready, pushing state', {
          t: stateRef.current.t,
          phase: stateRef.current.phase,
        })
      }
      if (handleRef.current) {
        handleRef.current.scene = scene
      }
      scene.setRaceState(stateRef.current)
    })

    return () => {
      handle.destroy()
      if (import.meta.env.DEV) {
        console.debug('[phaser-stage] destroyed')
      }
      handleRef.current = null
    }
  }, [])

  return <div className="game-stage" ref={mountRef} />
}

