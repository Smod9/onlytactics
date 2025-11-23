import { useEffect, useRef } from 'react'
import type { RaceRole } from '@/types/race'
import { useRaceState } from '@/state/hooks'
import { identity } from '@/net/identity'
import { GameNetwork } from '@/net/gameNetwork'
import {
  angleDiff,
  apparentWindAngleSigned,
  computeVmgAngles,
  headingFromAwa,
  quantizeHeading,
} from '@/logic/physics'
import {
  HEADING_STEP_DEG,
  MAX_DOWNWIND_ANGLE_DEG,
  TURN_RATE_DEG,
} from '@/logic/constants'

const isInteractiveElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  )
}

export const useTacticianControls = (
  network: GameNetwork | undefined,
  role: RaceRole,
) => {
  const raceState = useRaceState()
  const raceRef = useRef(raceState)
  const networkRef = useRef(network)
  const roleRef = useRef(role)
  const lockUntilRef = useRef(0)

  useEffect(() => {
    raceRef.current = raceState
  }, [raceState])

  useEffect(() => {
    networkRef.current = network
  }, [network])

  useEffect(() => {
    roleRef.current = role
  }, [role])

  useEffect(() => {
    if (!network || role === 'spectator') return

    const handleKey = (event: KeyboardEvent) => {
      if (
        !networkRef.current ||
        roleRef.current === 'spectator' ||
        isInteractiveElement(event.target)
      ) {
        return
      }

      const key = event.code ?? event.key
      if (!['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'KeyS'].includes(key)) {
        return
      }
      if (event.repeat) {
        event.preventDefault()
        return
      }

      const now = performance.now()
      if (lockUntilRef.current > now) {
        event.preventDefault()
        return
      }

      const state = raceRef.current
      const boat = state.boats[identity.boatId]
      if (!boat) return

      const lastHeadingRef = raceRef.current.boats[identity.boatId]?.desiredHeadingDeg
      const lastHeading = lastHeadingRef ?? boat.desiredHeadingDeg ?? boat.headingDeg

      const awa = apparentWindAngleSigned(boat.headingDeg, state.wind.directionDeg)
      const tackSign = awa >= 0 ? 1 : -1
      const absAwa = Math.abs(awa)
      const vmgAngles = computeVmgAngles(state.wind.speed)

      const lastRounded = quantizeHeading(lastHeading)

      const sendHeading = (heading: number) => {
        const rounded = quantizeHeading(heading)
        if (rounded === lastRounded) return
        networkRef.current?.updateDesiredHeading(rounded)
        event.preventDefault()
      }

      const setLockForHeading = (target: number) => {
        const diff = Math.abs(angleDiff(target, boat.headingDeg))
        const seconds = diff / TURN_RATE_DEG + 0.5
        lockUntilRef.current = now + seconds * 1000
      }

      switch (key) {
        case 'Space': {
          const isUpwind = absAwa <= 90
          const targetAwa = isUpwind ? vmgAngles.upwindAwa : vmgAngles.downwindAwa
          const heading = headingFromAwa(
            state.wind.directionDeg,
            tackSign * targetAwa,
          )
          sendHeading(heading)
          break
        }
        case 'Enter': {
          const isUpwind = absAwa < 90
          const nextSign = -tackSign || 1
          const targetAwa = isUpwind ? vmgAngles.upwindAwa : vmgAngles.downwindAwa
          const heading = headingFromAwa(state.wind.directionDeg, nextSign * targetAwa)
          setLockForHeading(heading)
          sendHeading(heading)
          break
        }
        case 'ArrowUp': {
          event.preventDefault()
          const desiredAbs = Math.max(absAwa - HEADING_STEP_DEG, 0)
          const heading = headingFromAwa(
            state.wind.directionDeg,
            tackSign * desiredAbs,
          )
          sendHeading(heading)
          break
        }
        case 'ArrowDown': {
          event.preventDefault()
          const desiredAbs = Math.min(absAwa + HEADING_STEP_DEG, MAX_DOWNWIND_ANGLE_DEG)
          const heading = headingFromAwa(
            state.wind.directionDeg,
            tackSign * desiredAbs,
          )
          sendHeading(heading)
          break
        }
        case 'KeyS': {
          event.preventDefault()
          networkRef.current?.requestSpin()
          break
        }
        default:
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [network, role])
}

