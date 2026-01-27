import { useEffect, useRef } from 'react'
import { appEnv } from '@/config/env'
import type { RaceRole } from '@/types/race'
import { useRaceState } from '@/state/hooks'
import { identity } from '@/net/identity'
import { GameNetwork } from '@/net/gameNetwork'
import { raceStore } from '@/state/raceStore'
import {
  angleDiff,
  trueWindAngleSigned,
  computeVmgAngles,
  headingFromTwa,
  quantizeHeading,
} from '@/logic/physics'
import {
  HARD_TURN_STEP_DEG,
  HEADING_STEP_DEG,
  MAX_DOWNWIND_ANGLE_DEG,
  TACK_LOCK_ENABLED,
  TACK_MIN_TIME_SECONDS,
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
  const seqRef = useRef(0)
  const pendingRef = useRef(new Map<number, number>())
  const lastAckSeqRef = useRef(0)
  const vmgModeRef = useRef(false)
  const blowSailsHeldRef = useRef(false)
  const blowSailsByLHeldRef = useRef(false)

  useEffect(() => {
    raceRef.current = raceState
    // Sync vmgModeRef with current boat state
    const boat = raceState.boats[identity.boatId]
    if (boat?.vmgMode !== undefined) {
      vmgModeRef.current = boat.vmgMode
    }
  }, [raceState])

  useEffect(() => {
    networkRef.current = network
  }, [network])

  useEffect(() => {
    roleRef.current = role
  }, [role])

  useEffect(() => {
    if (!network || role === 'spectator' || role === 'judge') return

    const normalizeKey = (event: KeyboardEvent) =>
      // Some browsers (notably iOS Safari / synthetic keyboard events) may provide an empty string
      // for event.code. Use a best-effort fallback for those cases.
      event.code || event.key

    const debugInputLog = (label: string, data?: Record<string, unknown>) => {
      if (!appEnv.debugHud) return

      console.debug(`[inputs] ${label}`, {
        ...data,
        held: {
          blowByL: blowSailsByLHeldRef.current,
          blowSailsSent: blowSailsHeldRef.current,
        },
      })
    }

    const syncBlowSails = (event?: KeyboardEvent) => {
      // Held control: blow sails (depower) while L is down.
      const desired = blowSailsByLHeldRef.current
      if (desired === blowSailsHeldRef.current) return

      debugInputLog('syncBlowSails:transition', {
        desired,
        from: blowSailsHeldRef.current,
        via: event ? 'keyboard' : 'non-keyboard',
      })
      blowSailsHeldRef.current = desired
      const seq = (seqRef.current += 1)
      pendingRef.current.set(seq, performance.now())
      networkRef.current?.setBlowSails(desired, seq)
      event?.preventDefault()
    }

    const handleKey = (event: KeyboardEvent) => {
      if (
        !networkRef.current ||
        roleRef.current === 'spectator' ||
        roleRef.current === 'judge' ||
        isInteractiveElement(event.target)
      ) {
        return
      }

      const key = normalizeKey(event)
      debugInputLog('keydown', {
        key,
        raw: { code: event.code, key: event.key, location: event.location },
        meta: { shiftKey: event.shiftKey, altKey: event.altKey, repeat: event.repeat },
      })
      const allowed = ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'KeyS', 'KeyP', 'KeyL']
      if (appEnv.debugHud) allowed.push('KeyJ')
      if (!allowed.includes(key)) {
        debugInputLog('keydown:ignored', { key })
        return
      }
      if (event.repeat) {
        event.preventDefault()
        if (key === 'KeyL') {
          // Keep L held state in sync during key repeats.
          blowSailsByLHeldRef.current = true
          syncBlowSails(event)
        }
        return
      }

      const now = performance.now()
      if (TACK_LOCK_ENABLED && lockUntilRef.current > now) {
        debugInputLog('keydown:blockedByTackLock', {
          key,
          lockUntil: lockUntilRef.current,
          now,
        })
        event.preventDefault()
        return
      }

      // Prevent Safari/iPadOS from treating Arrow keys (especially Shift+Arrow) as text selection.
      // We already ignore interactive targets above; if we get here we intend to "own" these keys.
      event.preventDefault()

      const state = raceRef.current
      const boat = state.boats[identity.boatId]
      if (!boat) return

      const lastHeadingRef = raceRef.current.boats[identity.boatId]?.desiredHeadingDeg
      const lastHeading = lastHeadingRef ?? boat.desiredHeadingDeg ?? boat.headingDeg

      const twa = trueWindAngleSigned(boat.headingDeg, state.wind.directionDeg)
      const tackSign = twa >= 0 ? 1 : -1
      const absTwa = Math.abs(twa)
      const vmgAngles = computeVmgAngles(state.wind.speed)

      const sendHeading = (heading: number) => {
        const rounded = quantizeHeading(heading)
        const lastRounded = quantizeHeading(lastHeading)
        if (rounded === lastRounded) return
        const seq = (seqRef.current += 1)
        const delta = angleDiff(rounded, lastRounded)
        pendingRef.current.set(seq, performance.now())
        networkRef.current?.updateDesiredHeading(rounded, seq, delta)
        event.preventDefault()
      }

      const exitVmgMode = () => {
        if (vmgModeRef.current) {
          vmgModeRef.current = false
          const seq = (seqRef.current += 1)
          pendingRef.current.set(seq, performance.now())
          networkRef.current?.updateVmgMode(false, seq)
        }
      }

      const setLockForHeading = (target: number) => {
        if (!TACK_LOCK_ENABLED) return
        const diff = Math.abs(angleDiff(target, boat.headingDeg))
        // Calculate time based on turn rate, but enforce minimum tack time
        const calculatedSeconds = diff / TURN_RATE_DEG + 0.5
        const seconds = Math.max(calculatedSeconds, TACK_MIN_TIME_SECONDS)
        lockUntilRef.current = now + seconds * 1000
      }

      switch (key) {
        case 'KeyL': {
          // Held control: blow sails (depower) while the key is down.
          blowSailsByLHeldRef.current = true
          debugInputLog('keyL:down')
          syncBlowSails(event)
          break
        }
        case 'Space': {
          // Enter VMG mode (idempotent). Exiting VMG is handled by manual steering inputs.
          if (!vmgModeRef.current) {
            vmgModeRef.current = true
            const seq = (seqRef.current += 1)
            pendingRef.current.set(seq, performance.now())
            networkRef.current?.updateVmgMode(true, seq)
          }
          break
        }
        case 'Enter': {
          exitVmgMode()
          const isUpwind = absTwa < 90
          const nextSign = -tackSign || 1
          const targetTwa = isUpwind ? vmgAngles.upwindTwa : vmgAngles.downwindTwa
          const heading = headingFromTwa(state.wind.directionDeg, nextSign * targetTwa)
          setLockForHeading(heading)
          sendHeading(heading)
          break
        }
        case 'ArrowUp': {
          exitVmgMode()
          const hardModifier = event.shiftKey || event.altKey
          debugInputLog('arrowUp', { hardModifier })
          const step = hardModifier ? HARD_TURN_STEP_DEG : HEADING_STEP_DEG
          const desiredAbs = Math.max(absTwa - step, 0)
          const heading = headingFromTwa(state.wind.directionDeg, tackSign * desiredAbs)
          sendHeading(heading)
          break
        }
        case 'ArrowDown': {
          exitVmgMode()
          const hardModifier = event.shiftKey || event.altKey
          debugInputLog('arrowDown', { hardModifier })
          const step = hardModifier ? HARD_TURN_STEP_DEG : HEADING_STEP_DEG
          const desiredAbs = Math.min(absTwa + step, MAX_DOWNWIND_ANGLE_DEG)
          const heading = headingFromTwa(state.wind.directionDeg, tackSign * desiredAbs)
          sendHeading(heading)
          break
        }
        case 'KeyS': {
          if (!boat.penalties || boat.penalties <= 0) {
            debugInputLog('keyS:ignored', { reason: 'no-penalties' })
            break
          }
          exitVmgMode()
          const seq = (seqRef.current += 1)
          pendingRef.current.set(seq, performance.now())
          networkRef.current?.requestSpin(seq)
          break
        }
        case 'KeyP': {
          networkRef.current?.clearOnePenalty()
          break
        }
        case 'KeyJ': {
          if (!appEnv.debugHud) break
          // Debug: Jump to next mark
          networkRef.current?.debugJumpBoatToNextMark(identity.boatId)
          break
        }
        default:
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (
        !networkRef.current ||
        roleRef.current === 'spectator' ||
        roleRef.current === 'judge'
      ) {
        return
      }

      const key = normalizeKey(event)
      if (isInteractiveElement(event.target) && key !== 'KeyL') {
        return
      }
      debugInputLog('keyup', {
        key,
        raw: { code: event.code, key: event.key, location: event.location },
        meta: { shiftKey: event.shiftKey, altKey: event.altKey },
      })

      if (key === 'KeyL') {
        blowSailsByLHeldRef.current = false
        debugInputLog('keyL:up')
        syncBlowSails(event)
        return
      }
    }

    const releaseHeldInputs = () => {
      if (!networkRef.current) return
      debugInputLog('releaseHeldInputs')
      blowSailsByLHeldRef.current = false
      if (!blowSailsHeldRef.current) return
      blowSailsHeldRef.current = false
      const seq = (seqRef.current += 1)
      pendingRef.current.set(seq, performance.now())
      networkRef.current.setBlowSails(false, seq)
    }

    window.addEventListener('keydown', handleKey, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', releaseHeldInputs)
    document.addEventListener('visibilitychange', releaseHeldInputs)
    return () => {
      window.removeEventListener('keydown', handleKey, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', releaseHeldInputs)
      document.removeEventListener('visibilitychange', releaseHeldInputs)
    }
  }, [network, role])

  useEffect(() => {
    const boat = raceRef.current.boats[identity.boatId]
    if (!boat?.lastInputSeq) return
    if (boat.lastInputSeq === lastAckSeqRef.current) return
    lastAckSeqRef.current = boat.lastInputSeq
    const sentAt = pendingRef.current.get(boat.lastInputSeq)
    if (sentAt === undefined) {
      return
    }
    pendingRef.current.delete(boat.lastInputSeq)
    const latencyMs = performance.now() - sentAt
    raceStore.recordInputLatency(boat.id, boat.lastInputSeq, latencyMs)
  }, [raceState])
}
