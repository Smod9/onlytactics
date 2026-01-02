import { useEffect, useRef } from 'react'
import { appEnv } from '@/config/env'
import type { RaceRole } from '@/types/race'
import { useRaceState } from '@/state/hooks'
import { identity } from '@/net/identity'
import { GameNetwork } from '@/net/gameNetwork'
import { raceStore } from '@/state/raceStore'
import {
  angleDiff,
  apparentWindAngleSigned,
  computeVmgAngles,
  headingFromAwa,
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
  const hardTurnHeldRef = useRef(false)

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

    const normalizeKey = (event: KeyboardEvent) => {
      // Some browsers (notably iOS Safari / synthetic keyboard events) may provide an empty string
      // for event.code. Use a best-effort normalization so left/right modifiers still work.
      if (event.code) return event.code
      if (event.key === 'Shift') {
        if (event.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT) return 'ShiftLeft'
        // If location is unavailable (0 / standard), fall back to plain "Shift".
      }
      return event.key
    }

    const debugInputLog = (label: string, data?: Record<string, unknown>) => {
      if (!appEnv.debugHud) return

      console.debug(`[inputs] ${label}`, {
        ...data,
        held: {
          hardTurnLeftShift: hardTurnHeldRef.current,
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

    const syncShiftReleasedFromNonKeyboardEvent = (shiftKey: boolean) => {
      // Safari can occasionally drop the keyup for modifier keys when both L/R Shift are involved.
      // As a safety net, if *any* user event reports that Shift is not currently held, clear
      // our shift-derived held flags and resync.
      if (shiftKey) return
      debugInputLog('nonKeyboard:shiftReleased', { shiftKey })
      hardTurnHeldRef.current = false
      syncBlowSails()
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
      const allowed = [
        'Space',
        'Enter',
        'ArrowUp',
        'ArrowDown',
        'KeyS',
        'KeyP',
        'KeyL',
        'ShiftLeft',
        'Shift',
      ]
      if (appEnv.debugHud) allowed.push('KeyJ')
      if (!allowed.includes(key)) {
        debugInputLog('keydown:ignored', { key })
        return
      }
      if (event.repeat) {
        event.preventDefault()
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

      const awa = apparentWindAngleSigned(boat.headingDeg, state.wind.directionDeg)
      const tackSign = awa >= 0 ? 1 : -1
      const absAwa = Math.abs(awa)
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
        case 'ShiftLeft': {
          // Track left shift separately so "hard turns" only apply to the left-hand Shift key.
          hardTurnHeldRef.current = true
          debugInputLog('shiftLeft:down')
          break
        }
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
          const isUpwind = absAwa < 90
          const nextSign = -tackSign || 1
          const targetAwa = isUpwind ? vmgAngles.upwindAwa : vmgAngles.downwindAwa
          const heading = headingFromAwa(state.wind.directionDeg, nextSign * targetAwa)
          setLockForHeading(heading)
          sendHeading(heading)
          break
        }
        case 'ArrowUp': {
          exitVmgMode()
          const hardModifier = hardTurnHeldRef.current || event.altKey
          debugInputLog('arrowUp', { hardModifier })
          const step = hardModifier ? HARD_TURN_STEP_DEG : HEADING_STEP_DEG
          const desiredAbs = Math.max(absAwa - step, 0)
          const heading = headingFromAwa(state.wind.directionDeg, tackSign * desiredAbs)
          sendHeading(heading)
          break
        }
        case 'ArrowDown': {
          exitVmgMode()
          const hardModifier = hardTurnHeldRef.current || event.altKey
          debugInputLog('arrowDown', { hardModifier })
          const step = hardModifier ? HARD_TURN_STEP_DEG : HEADING_STEP_DEG
          const desiredAbs = Math.min(absAwa + step, MAX_DOWNWIND_ANGLE_DEG)
          const heading = headingFromAwa(state.wind.directionDeg, tackSign * desiredAbs)
          sendHeading(heading)
          break
        }
        case 'KeyS': {
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
        roleRef.current === 'judge' ||
        isInteractiveElement(event.target)
      ) {
        return
      }

      const key = normalizeKey(event)
      debugInputLog('keyup', {
        key,
        raw: { code: event.code, key: event.key, location: event.location },
        meta: { shiftKey: event.shiftKey, altKey: event.altKey },
      })
      if (key === 'Shift') {
        // Defensive fallback: some platforms report Shift keyup without left/right identity.
        event.preventDefault()
        // If no shift is currently held, also clear hard-turn state.
        if (!event.shiftKey) {
          hardTurnHeldRef.current = false
        }
        debugInputLog('shift:keyupFallback', { shiftKey: event.shiftKey })
        return
      }
      if (key === 'ShiftLeft') {
        event.preventDefault()
        hardTurnHeldRef.current = false
        debugInputLog('shiftLeft:up')
        return
      }

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
      hardTurnHeldRef.current = false
      blowSailsByLHeldRef.current = false
      if (!blowSailsHeldRef.current) return
      blowSailsHeldRef.current = false
      const seq = (seqRef.current += 1)
      pendingRef.current.set(seq, performance.now())
      networkRef.current.setBlowSails(false, seq)
    }

    const handlePointerSignal = (
      event: PointerEvent | MouseEvent | WheelEvent | TouchEvent,
    ) => {
      // TouchEvent doesn't have shiftKey; for those, we can't learn anything.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maybeShiftKey = (event as any).shiftKey
      if (typeof maybeShiftKey !== 'boolean') return
      debugInputLog('nonKeyboard:event', {
        type: event.type,
        shiftKey: maybeShiftKey,
      })
      syncShiftReleasedFromNonKeyboardEvent(maybeShiftKey)
    }

    window.addEventListener('keydown', handleKey, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', releaseHeldInputs)
    document.addEventListener('visibilitychange', releaseHeldInputs)
    window.addEventListener('pointermove', handlePointerSignal, { capture: true })
    window.addEventListener('pointerdown', handlePointerSignal, { capture: true })
    window.addEventListener('mousemove', handlePointerSignal, { capture: true })
    window.addEventListener('mousedown', handlePointerSignal, { capture: true })
    window.addEventListener('wheel', handlePointerSignal, { capture: true })
    window.addEventListener('touchstart', handlePointerSignal, { capture: true })
    window.addEventListener('touchmove', handlePointerSignal, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKey, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', releaseHeldInputs)
      document.removeEventListener('visibilitychange', releaseHeldInputs)
      window.removeEventListener('pointermove', handlePointerSignal, { capture: true })
      window.removeEventListener('pointerdown', handlePointerSignal, { capture: true })
      window.removeEventListener('mousemove', handlePointerSignal, { capture: true })
      window.removeEventListener('mousedown', handlePointerSignal, { capture: true })
      window.removeEventListener('wheel', handlePointerSignal, { capture: true })
      window.removeEventListener('touchstart', handlePointerSignal, { capture: true })
      window.removeEventListener('touchmove', handlePointerSignal, { capture: true })
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
