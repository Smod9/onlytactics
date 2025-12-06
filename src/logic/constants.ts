export const KNOTS_TO_MS = 0.514444 * 2 //How fast a boat moves in meters per second (on the screen)
export const MAX_SPEED_KTS = 12
export const TURN_RATE_DEG = 90 //How fast a boat turns in degrees per second
export const ACCELERATION_RATE = 0.6 //How fast a boat accelerates in meters per second per second
export const DECELERATION_RATE = 0.4 //How fast a boat decelerates in meters per second per second
export const PORT_STARBOARD_DISTANCE = 19 //How far apart the ports and starboards are in meters
export const NO_GO_ANGLE_DEG = 35 //How far a boat can go before it stalls (we block this angle)
export const MAX_DOWNWIND_ANGLE_DEG = 140 //How far a boat can go downwind before it stalls
export const HEADING_STEP_DEG = 5 //How much a boat can turn in one step
export const STALL_DURATION_S = 3 //How long a boat stalls in seconds
export const STALL_SPEED_FACTOR = 0.35 //How much a boat slows down when it stalls
export const DEFAULT_SHEET = 0.75 //How much sheet a boat has when it starts
export const SPIN_HOLD_SECONDS = 2 //How long a boat holds when it spins
export const TACK_LOCK_ENABLED = false //Whether a boat can tack while it is locked
export const TACK_MIN_TIME_SECONDS = 1.0 //Minimum tack time in seconds
export const TACK_SPEED_PENALTY = 0.7 //Speed Multiplier:lower = slower, 1.0 = no penalty
export const TACK_MIN_ANGLE_DEG = 30 //Minimum turn angle (degrees) to be considered a tack and apply speed penalty


