import { describe, it, expect } from 'vitest'
import {
  RulesEngine,
  getTack,
  boatsTooClose,
  boatsNearby,
  circlesOverlap,
  isBehind,
  sternRammer,
  clampAngle180,
  DOWNWIND_DEAD_ZONE_DEG,
} from '@/logic/rules'
import type { BoatState, RaceState } from '@/types/race'

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const makeBoat = (overrides: Partial<BoatState> & { id: string }): BoatState => ({
  name: overrides.id,
  color: 0xffffff,
  pos: { x: 0, y: 0 },
  headingDeg: 0,
  desiredHeadingDeg: 0,
  speed: 5,
  lap: 0,
  nextMarkIndex: 0,
  inMarkZone: false,
  finished: false,
  penalties: 0,
  protestPenalties: 0,
  stallTimer: 0,
  tackTimer: 0,
  overEarly: false,
  fouled: false,
  rightsSuspended: false,
  ...overrides,
})

const makeState = (
  boats: BoatState[],
  windDirDeg = 0,
  t = 10,
): RaceState => ({
  t,
  meta: { raceId: 'test', courseName: 'test', createdAt: 0, seed: 0 },
  wind: { directionDeg: windDirDeg, speed: 15 },
  baselineWindDeg: windDirDeg,
  boats: Object.fromEntries(boats.map((b) => [b.id, b])),
  protests: {},
  marks: [],
  startLine: { pin: { x: -50, y: 0 }, committee: { x: 50, y: 0 } },
  leewardGate: { left: { x: -30, y: 500 }, right: { x: 30, y: 500 } },
  phase: 'running',
  countdownArmed: false,
  clockStartMs: null,
  lapsToFinish: 1,
  leaderboard: [],
  aiEnabled: false,
})

// ---------------------------------------------------------------------------
// clampAngle180
// ---------------------------------------------------------------------------

describe('clampAngle180', () => {
  it('returns 0 for 0', () => expect(clampAngle180(0)).toBe(0))
  it('returns 90 for 90', () => expect(clampAngle180(90)).toBe(90))
  it('returns -90 for -90', () => expect(clampAngle180(-90)).toBe(-90))
  it('wraps 270 to -90', () => expect(clampAngle180(270)).toBe(-90))
  it('wraps -270 to 90', () => expect(clampAngle180(-270)).toBe(90))
  it('wraps 360 to 0', () => expect(clampAngle180(360)).toBe(0))
  it('handles 180 as positive', () => expect(clampAngle180(180)).toBe(180))
  it('wraps -180 to 180', () => expect(clampAngle180(-180)).toBe(180))
})

// ---------------------------------------------------------------------------
// getTack
// ---------------------------------------------------------------------------

describe('getTack', () => {
  it('heading 45° with wind 0° (north) is port', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 45 }), 0)).toBe('port')
  })

  it('heading 315° with wind 0° is starboard', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 315 }), 0)).toBe('starboard')
  })

  it('heading 90° with wind 0° is port (beam reach port)', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 90 }), 0)).toBe('port')
  })

  it('heading 270° with wind 0° is starboard (beam reach stbd)', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 270 }), 0)).toBe('starboard')
  })

  it('heading 0° with wind 0° (head to wind) is port (boundary)', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 0 }), 0)).toBe('port')
  })

  it('close-hauled starboard with wind from north', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 330 }), 0)).toBe('starboard')
  })

  it('downwind port (TWA ~170)', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 170 }), 0)).toBe('port')
  })

  it('downwind starboard (TWA ~-170)', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 190 }), 0)).toBe('starboard')
  })

  it('exactly dead downwind (TWA = 180) is port (edge case)', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 180 }), 0)).toBe('port')
  })

  it('works with non-zero wind direction', () => {
    expect(getTack(makeBoat({ id: 'a', headingDeg: 135 }), 90)).toBe('port')
    expect(getTack(makeBoat({ id: 'a', headingDeg: 45 }), 90)).toBe('starboard')
  })

  describe('downwind instability (documents the known bug)', () => {
    it('two boats 2° apart at deep downwind get different tacks', () => {
      const boat1 = makeBoat({ id: 'a', headingDeg: 179 })
      const boat2 = makeBoat({ id: 'b', headingDeg: 181 })
      const tack1 = getTack(boat1, 0)
      const tack2 = getTack(boat2, 0)
      // This documents the bug: near dead downwind, a 2° difference flips tack
      expect(tack1).toBe('port')
      expect(tack2).toBe('starboard')
    })
  })
})

// ---------------------------------------------------------------------------
// circlesOverlap
// ---------------------------------------------------------------------------

describe('circlesOverlap', () => {
  it('overlapping circles', () => {
    expect(circlesOverlap({ x: 0, y: 0, r: 5 }, { x: 8, y: 0, r: 5 })).toBe(true)
  })

  it('just touching circles', () => {
    expect(circlesOverlap({ x: 0, y: 0, r: 5 }, { x: 10, y: 0, r: 5 })).toBe(true)
  })

  it('just apart circles', () => {
    expect(circlesOverlap({ x: 0, y: 0, r: 5 }, { x: 10.01, y: 0, r: 5 })).toBe(false)
  })

  it('concentric circles', () => {
    expect(circlesOverlap({ x: 5, y: 5, r: 3 }, { x: 5, y: 5, r: 1 })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// boatsTooClose
// ---------------------------------------------------------------------------

describe('boatsTooClose', () => {
  it('boats at same position overlap', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 0, y: 0 }, headingDeg: 0 })
    expect(boatsTooClose(a, b)).toBe(true)
  })

  it('boats side by side within stern radius sum overlap', () => {
    // Heading north, sterns are at y+6 with r=9. Distance between sterns <= 18
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 17, y: 0 }, headingDeg: 0 })
    expect(boatsTooClose(a, b)).toBe(true)
  })

  it('boats far apart do not overlap', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 100, y: 0 }, headingDeg: 0 })
    expect(boatsTooClose(a, b)).toBe(false)
  })

  it('boats heading in different directions can still overlap', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 10, y: 0 }, headingDeg: 90 })
    expect(boatsTooClose(a, b)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isBehind
// ---------------------------------------------------------------------------

describe('isBehind', () => {
  it('boat behind another heading north', () => {
    // heading 0 = north = {0, -1}. "other" south of target = behind
    const target = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const other = makeBoat({ id: 'b', pos: { x: 0, y: 10 }, headingDeg: 0 })
    expect(isBehind(target, other)).toBe(true)
  })

  it('boat ahead is not behind', () => {
    const target = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const other = makeBoat({ id: 'b', pos: { x: 0, y: -10 }, headingDeg: 0 })
    expect(isBehind(target, other)).toBe(false)
  })

  it('boat directly abeam is not behind (dot product = 0)', () => {
    const target = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const other = makeBoat({ id: 'b', pos: { x: 10, y: 0 }, headingDeg: 0 })
    expect(isBehind(target, other)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sternRammer
// ---------------------------------------------------------------------------

describe('sternRammer', () => {
  it('returns the boat whose bow hits the other stern', () => {
    // A heading north at (0,0), B heading north just behind A
    // B's bow should be near A's stern
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    // Place B directly behind A. A's stern is at (0, 6). B's bow is at (0, y-12).
    // For B's bow to overlap A's stern: dist <= 4.5 + 9 = 13.5
    // B at (0, 18): B's bow = (0, 6), A's stern = (0, 6) → distance 0 → overlap
    const b = makeBoat({ id: 'b', pos: { x: 0, y: 18 }, headingDeg: 0 })
    expect(sternRammer(a, b)).toBe(b)
  })

  it('returns null when boats are side by side', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 15, y: 0 }, headingDeg: 0 })
    expect(sternRammer(a, b)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// RulesEngine – Rule 10 (port/starboard)
// ---------------------------------------------------------------------------

describe('RulesEngine – Rule 10', () => {
  it('port tack boat penalized when close to starboard tack boat', () => {
    const engine = new RulesEngine(0)
    // Wind from North (0°). Port tack heading 45°, starboard tack heading 315°
    const portBoat = makeBoat({ id: 'port', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const stbdBoat = makeBoat({ id: 'stbd', pos: { x: 5, y: 0 }, headingDeg: 315 })
    const state = makeState([portBoat, stbdBoat], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('10')
    expect(results[0].offenderId).toBe('port')
  })

  it('no penalty when boats are on the same tack', () => {
    const engine = new RulesEngine(0)
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const b = makeBoat({ id: 'b', pos: { x: 5, y: 0 }, headingDeg: 50 })
    const state = makeState([a, b], 0)

    const results = engine.evaluate(state)
    // Should be Rule 11 not Rule 10
    const rule10 = results.filter((r) => r.ruleId === '10')
    expect(rule10).toHaveLength(0)
  })

  it('no penalty when boats are far apart', () => {
    const engine = new RulesEngine(0)
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const b = makeBoat({ id: 'b', pos: { x: 100, y: 0 }, headingDeg: 315 })
    const state = makeState([a, b], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(0)
  })

  it('no penalty when stand-on boat has rights suspended', () => {
    const engine = new RulesEngine(0)
    const portBoat = makeBoat({ id: 'port', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const stbdBoat = makeBoat({
      id: 'stbd',
      pos: { x: 5, y: 0 },
      headingDeg: 315,
      rightsSuspended: true,
    })
    const state = makeState([portBoat, stbdBoat], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// RulesEngine – Rule 11 (windward/leeward)
// ---------------------------------------------------------------------------

describe('RulesEngine – Rule 11', () => {
  it('windward boat penalized when overlapping leeward boat (same tack)', () => {
    const engine = new RulesEngine(0)
    // Wind from north. Both on port tack (heading ~45°).
    // Boat further upwind (north = lower y) is windward.
    const windward = makeBoat({ id: 'windward', pos: { x: 0, y: -5 }, headingDeg: 45 })
    const leeward = makeBoat({ id: 'leeward', pos: { x: 0, y: 5 }, headingDeg: 50 })
    const state = makeState([windward, leeward], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('11')
    expect(results[0].offenderId).toBe('windward')
  })

  it('windward/leeward correct for wind from east', () => {
    const engine = new RulesEngine(0)
    // Wind from east (90°). Both on port tack. Windward = more east = higher x.
    const windward = makeBoat({ id: 'windward', pos: { x: 10, y: 0 }, headingDeg: 135 })
    const leeward = makeBoat({ id: 'leeward', pos: { x: 0, y: 0 }, headingDeg: 140 })
    const state = makeState([windward, leeward], 90)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('11')
    expect(results[0].offenderId).toBe('windward')
  })

  it('windward/leeward correct for wind from south', () => {
    const engine = new RulesEngine(0)
    // Wind from south (180°). Windward = more south = higher y.
    const windward = makeBoat({ id: 'windward', pos: { x: 0, y: 10 }, headingDeg: 225 })
    const leeward = makeBoat({ id: 'leeward', pos: { x: 0, y: 0 }, headingDeg: 230 })
    const state = makeState([windward, leeward], 180)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('11')
    expect(results[0].offenderId).toBe('windward')
  })

  it('windward/leeward correct for wind from west', () => {
    const engine = new RulesEngine(0)
    // Wind from west (270°). Windward = more west = lower x.
    const windward = makeBoat({ id: 'windward', pos: { x: -10, y: 0 }, headingDeg: 315 })
    const leeward = makeBoat({ id: 'leeward', pos: { x: 0, y: 0 }, headingDeg: 320 })
    const state = makeState([windward, leeward], 270)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('11')
    expect(results[0].offenderId).toBe('windward')
  })

  it('stern rammer overrides windward as offender', () => {
    const engine = new RulesEngine(0)
    // Both heading north at 10° (port tack, TWA=10). B directly behind A.
    // heading 10°: forward ≈ {0.17, -0.98}
    // A stern at ~(0 - 1.04, 0 + 5.91), B bow at ~(0 + 2.08, 18 - 11.82) = (2.08, 6.18)
    // With heading 0° both at x=0, B bow at (0,6), A stern at (0,6) → overlap
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 10 })
    const b = makeBoat({ id: 'b', pos: { x: 0, y: 18 }, headingDeg: 10 })
    const state = makeState([a, b], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('11')
    // B's bow hits A's stern, so B is the stern rammer → offender
    expect(results[0].offenderId).toBe('b')
  })

  it('no penalty when stand-on boat has rights suspended', () => {
    const engine = new RulesEngine(0)
    const windward = makeBoat({ id: 'windward', pos: { x: 0, y: -5 }, headingDeg: 45 })
    const leeward = makeBoat({
      id: 'leeward',
      pos: { x: 0, y: 5 },
      headingDeg: 50,
      rightsSuspended: true,
    })
    const state = makeState([windward, leeward], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(0)
  })

  describe('downwind scenarios', () => {
    it('correctly identifies windward/leeward when running downwind', () => {
      const engine = new RulesEngine(0)
      // Wind from north (0°). Both running deep downwind on port tack.
      // Boat A at (10, 100) is more east (to the right looking downwind) but at same depth.
      // Windward = more north = lower y → A more north if at lower y
      const windward = makeBoat({ id: 'windward', pos: { x: 5, y: 95 }, headingDeg: 170 })
      const leeward = makeBoat({ id: 'leeward', pos: { x: 5, y: 105 }, headingDeg: 170 })
      const state = makeState([windward, leeward], 0)

      const results = engine.evaluate(state)
      expect(results).toHaveLength(1)
      expect(results[0].offenderId).toBe('windward')
    })
  })
})

// ---------------------------------------------------------------------------
// RulesEngine – Cooldown (recordOnce)
// ---------------------------------------------------------------------------

describe('RulesEngine – Cooldown', () => {
  it('suppresses duplicate penalty within cooldown window', () => {
    const engine = new RulesEngine(5)
    const portBoat = makeBoat({ id: 'port', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const stbdBoat = makeBoat({ id: 'stbd', pos: { x: 5, y: 0 }, headingDeg: 315 })

    const state1 = makeState([portBoat, stbdBoat], 0, 10)
    expect(engine.evaluate(state1)).toHaveLength(1)

    const state2 = makeState([portBoat, stbdBoat], 0, 12)
    expect(engine.evaluate(state2)).toHaveLength(0)
  })

  it('fires again after cooldown expires and boats have separated', () => {
    const engine = new RulesEngine(5)
    const portBoat = makeBoat({ id: 'port', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const stbdBoat = makeBoat({ id: 'stbd', pos: { x: 5, y: 0 }, headingDeg: 315 })

    const state1 = makeState([portBoat, stbdBoat], 0, 10)
    expect(engine.evaluate(state1)).toHaveLength(1)

    // Still overlapping after cooldown time — incident cooldown blocks it
    const state2 = makeState([portBoat, stbdBoat], 0, 16)
    expect(engine.evaluate(state2)).toHaveLength(0)

    // Boats separate (clear the incident cooldown's separation requirement)
    const portFar = makeBoat({ id: 'port', pos: { x: -100, y: 0 }, headingDeg: 45 })
    const stbdFar = makeBoat({ id: 'stbd', pos: { x: 100, y: 0 }, headingDeg: 315 })
    const stateSep = makeState([portFar, stbdFar], 0, 16.5)
    expect(engine.evaluate(stateSep)).toHaveLength(0)

    // Boats converge again after separation — penalty fires
    const state3 = makeState([portBoat, stbdBoat], 0, 17)
    expect(engine.evaluate(state3)).toHaveLength(1)
  })

  it('offender cooldown blocks different pair with same offender', () => {
    const engine = new RulesEngine(5)
    const portBoat = makeBoat({ id: 'port', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const stbd1 = makeBoat({ id: 'stbd1', pos: { x: 5, y: 0 }, headingDeg: 315 })
    const stbd2 = makeBoat({ id: 'stbd2', pos: { x: -5, y: 0 }, headingDeg: 315 })

    const state1 = makeState([portBoat, stbd1, stbd2], 0, 10)
    const results = engine.evaluate(state1)
    // port fouls both stbd boats, but offender cooldown should block the second
    const rule10 = results.filter((r) => r.ruleId === '10')
    expect(rule10).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// RulesEngine – computeCollisionOutcomes
// ---------------------------------------------------------------------------

describe('RulesEngine – computeCollisionOutcomes', () => {
  it('marks both boats as collided when close', () => {
    const engine = new RulesEngine(0)
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const b = makeBoat({ id: 'b', pos: { x: 5, y: 0 }, headingDeg: 315 })
    const state = makeState([a, b], 0)

    const outcome = engine.computeCollisionOutcomes(state)
    expect(outcome.collidedBoatIds.has('a')).toBe(true)
    expect(outcome.collidedBoatIds.has('b')).toBe(true)
    expect(outcome.faults['a']).toBe('at_fault') // port tack
    expect(outcome.faults['b']).toBe('stand_on')
  })

  it('returns empty when boats are far apart', () => {
    const engine = new RulesEngine(0)
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 200, y: 200 }, headingDeg: 0 })
    const state = makeState([a, b], 0)

    const outcome = engine.computeCollisionOutcomes(state)
    expect(outcome.collidedBoatIds.size).toBe(0)
    expect(Object.keys(outcome.faults)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Deep Downwind Dead-Zone Fix
// ---------------------------------------------------------------------------

describe('Deep downwind dead-zone', () => {
  it('two boats near dead downwind on opposite computed tacks get Rule 11 (not Rule 10)', () => {
    const engine = new RulesEngine(0)
    // Wind from north. Boat A heading 179° (port), Boat B heading 181° (starboard).
    // Both are deep downwind (|TWA| > DOWNWIND_DEAD_ZONE_DEG).
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 179 })
    const b = makeBoat({ id: 'b', pos: { x: 5, y: 0 }, headingDeg: 181 })
    const state = makeState([a, b], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('11')
  })

  it('boats on different tacks NOT deep downwind still get Rule 10', () => {
    const engine = new RulesEngine(0)
    // TWA ~45° (port) and ~315° (starboard) — clearly upwind, different tacks
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const b = makeBoat({ id: 'b', pos: { x: 5, y: 0 }, headingDeg: 315 })
    const state = makeState([a, b], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('10')
  })

  it('one boat deep downwind and one not: Rule 10 still applies', () => {
    const engine = new RulesEngine(0)
    // A at 170° (TWA=170, deep), B at 90° (TWA=90, not deep)
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 170 })
    const b = makeBoat({ id: 'b', pos: { x: 5, y: 0 }, headingDeg: 270 })
    const state = makeState([a, b], 0)

    const results = engine.evaluate(state)
    const rule10 = results.filter((r) => r.ruleId === '10')
    // They are on different tacks and only one is deep, so Rule 10 applies
    expect(rule10.length).toBeGreaterThanOrEqual(1)
  })

  it('deep downwind boats get correct windward/leeward assignment', () => {
    const engine = new RulesEngine(0)
    // Wind from north. Both running dead downwind.
    // Windward = more north = lower y.
    const windward = makeBoat({ id: 'windward', pos: { x: 0, y: 0 }, headingDeg: 179 })
    const leeward = makeBoat({ id: 'leeward', pos: { x: 5, y: 10 }, headingDeg: 181 })
    const state = makeState([windward, leeward], 0)

    const results = engine.evaluate(state)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe('11')
    expect(results[0].offenderId).toBe('windward')
  })

  it(`threshold is ${DOWNWIND_DEAD_ZONE_DEG} degrees`, () => {
    const engine = new RulesEngine(0)
    // Just below the threshold: should NOT trigger dead-zone
    const belowThreshold = DOWNWIND_DEAD_ZONE_DEG - 1
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: belowThreshold })
    const b = makeBoat({ id: 'b', pos: { x: 5, y: 0 }, headingDeg: 360 - belowThreshold })
    const state = makeState([a, b], 0)

    const results = engine.evaluate(state)
    const rule10 = results.filter((r) => r.ruleId === '10')
    expect(rule10.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// boatsNearby (proximity check with scaled radii)
// ---------------------------------------------------------------------------

describe('boatsNearby', () => {
  it('returns true when boats are within scaled radius but not overlapping', () => {
    // Heading 0°: A stern at (0,6) r=9, B bow at (0,Y-12) r=4.5
    // Overlap at dist <= 13.5 → Y <= 31.5. Warning zone at 1.3x → Y <= 35.55.
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 0, y: 33 }, headingDeg: 0 })
    expect(boatsTooClose(a, b)).toBe(false)
    expect(boatsNearby(a, b)).toBe(true)
  })

  it('returns false when boats are far apart', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 100, y: 100 }, headingDeg: 0 })
    expect(boatsNearby(a, b)).toBe(false)
  })

  it('returns true when boats are already overlapping', () => {
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 0 })
    const b = makeBoat({ id: 'b', pos: { x: 5, y: 0 }, headingDeg: 0 })
    expect(boatsTooClose(a, b)).toBe(true)
    expect(boatsNearby(a, b)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// computeWarnings
// ---------------------------------------------------------------------------

describe('computeWarnings', () => {
  it('warns the would-be offender when boats are approaching (Rule 10)', () => {
    const engine = new RulesEngine(0)
    // Port (heading 45°) and starboard (heading 315°) converging.
    // At x=±14, bow-bow distance ≈ 11.0 — outside exact overlap (9) but inside 1.3x (11.7).
    const portBoat = makeBoat({ id: 'port', pos: { x: -14, y: 0 }, headingDeg: 45 })
    const stbdBoat = makeBoat({ id: 'stbd', pos: { x: 14, y: 0 }, headingDeg: 315 })
    const state = makeState([portBoat, stbdBoat], 0)

    expect(boatsTooClose(portBoat, stbdBoat)).toBe(false)
    expect(boatsNearby(portBoat, stbdBoat)).toBe(true)

    const warnings = engine.computeWarnings(state)
    expect(warnings.has('port')).toBe(true)
    expect(warnings.has('stbd')).toBe(false)
  })

  it('warns the windward boat when approaching same-tack (Rule 11)', () => {
    const engine = new RulesEngine(0)
    // Both on port tack, windward boat north of leeward.
    // At y=-20, stern-stern dist ≈ 19.6 — outside exact overlap (18) but inside 1.3x (23.4).
    const windward = makeBoat({ id: 'windward', pos: { x: 0, y: -20 }, headingDeg: 45 })
    const leeward = makeBoat({ id: 'leeward', pos: { x: 0, y: 0 }, headingDeg: 50 })
    const state = makeState([windward, leeward], 0)

    expect(boatsTooClose(windward, leeward)).toBe(false)
    expect(boatsNearby(windward, leeward)).toBe(true)

    const warnings = engine.computeWarnings(state)
    expect(warnings.has('windward')).toBe(true)
    expect(warnings.has('leeward')).toBe(false)
  })

  it('returns no warnings when boats are already overlapping', () => {
    const engine = new RulesEngine(0)
    const portBoat = makeBoat({ id: 'port', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const stbdBoat = makeBoat({ id: 'stbd', pos: { x: 5, y: 0 }, headingDeg: 315 })
    const state = makeState([portBoat, stbdBoat], 0)

    expect(boatsTooClose(portBoat, stbdBoat)).toBe(true)

    const warnings = engine.computeWarnings(state)
    expect(warnings.size).toBe(0)
  })

  it('returns no warnings when boats are far apart', () => {
    const engine = new RulesEngine(0)
    const a = makeBoat({ id: 'a', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const b = makeBoat({ id: 'b', pos: { x: 200, y: 200 }, headingDeg: 315 })
    const state = makeState([a, b], 0)

    const warnings = engine.computeWarnings(state)
    expect(warnings.size).toBe(0)
  })

  it('suppresses warnings for pairs in incident cooldown', () => {
    const engine = new RulesEngine(5)
    // First, trigger a penalty to create incident cooldown
    const portClose = makeBoat({ id: 'port', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const stbdClose = makeBoat({ id: 'stbd', pos: { x: 5, y: 0 }, headingDeg: 315 })
    const state1 = makeState([portClose, stbdClose], 0, 10)
    engine.evaluate(state1)

    // Now place them in warning range (separated but still nearby)
    const portNearby = makeBoat({ id: 'port', pos: { x: 0, y: 0 }, headingDeg: 45 })
    const stbdNearby = makeBoat({ id: 'stbd', pos: { x: 0, y: 22 }, headingDeg: 315 })
    const state2 = makeState([portNearby, stbdNearby], 0, 12)
    const warnings = engine.computeWarnings(state2)
    expect(warnings.size).toBe(0)
  })
})
