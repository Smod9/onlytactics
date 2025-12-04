export const KNOTS_TO_MS = 0.514444 * 2
export const MAX_SPEED_KTS = 12
// Increased from 60 to 90 to compensate for 2x speed increase (KNOTS_TO_MS)
// This maintains similar turning responsiveness despite boats moving faster
export const TURN_RATE_DEG = 90
export const ACCELERATION_RATE = 0.6
export const DECELERATION_RATE = 0.4
export const PORT_STARBOARD_DISTANCE = 19
export const NO_GO_ANGLE_DEG = 35
export const MAX_DOWNWIND_ANGLE_DEG = 140
export const HEADING_STEP_DEG = 5
export const STALL_DURATION_S = 3
export const STALL_SPEED_FACTOR = 0.35
export const DEFAULT_SHEET = 0.75
export const SPIN_HOLD_SECONDS = 2
export const TACK_LOCK_ENABLED = false
// Minimum time (in seconds) to complete a tack, regardless of turn rate
// Increased to compensate for faster turn rate - makes tacks more expensive
export const TACK_MIN_TIME_SECONDS = 1.8
// Speed penalty factor applied during tacks (0.0 to 1.0)
// Reduces boat speed while turning to make tacks more expensive
export const TACK_SPEED_PENALTY = 0.4
// Minimum turn angle (degrees) to be considered a tack and apply speed penalty
export const TACK_MIN_ANGLE_DEG = 30


