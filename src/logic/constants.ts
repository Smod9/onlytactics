export const KNOTS_TO_MS = 0.514444 * 2 //How fast a boat moves in meters per second (on the screen)
export const MAX_SPEED_KTS = 16
export const TURN_RATE_DEG = 90 //How fast a boat turns in degrees per second
export const ACCELERATION_RATE = 0.6 //How fast a boat accelerates in meters per second per second
export const DECELERATION_RATE = 0.4 //How fast a boat decelerates in meters per second per second
export const PORT_STARBOARD_DISTANCE = 19 //How far apart the ports and starboards are in meters
export const NO_GO_ANGLE_DEG = 25 //How far a boat can go before it stalls (we block this angle)
export const MAX_DOWNWIND_ANGLE_DEG = 177 // Maximum allowed downwind angle (TWA). Set to 180 to allow sailing as deep downwind as desired.
export const HEADING_STEP_DEG = 5 //How much a boat can turn in one step
export const HARD_TURN_STEP_DEG = 20 //How much a boat can turn in one step when holding Shift
export const STALL_DURATION_S = 3 //How long a boat stalls in seconds
export const STALL_SPEED_FACTOR = 0.35 //How much a boat slows down when it stalls
export const DEFAULT_SHEET = 0.75 //How much sheet a boat has when it starts
export const SPIN_HOLD_SECONDS = 2 //How long a boat holds when it spins
export const TACK_LOCK_ENABLED = false //Whether a boat can tack while it is locked
export const TACK_MIN_TIME_SECONDS = 1.0 //Minimum tack time in seconds
export const TACK_SPEED_PENALTY = 0.7 //Speed Multiplier:lower = slower, 1.0 = no penalty
export const TACK_MIN_ANGLE_DEG = 30 //Minimum turn angle (degrees) to be considered a tack and apply speed penalty

// Collision footprint (capsule-like: small bow circle + larger stern circle)
export const BOAT_BOW_RADIUS = 4.5
export const BOAT_STERN_RADIUS = 9
export const BOAT_BOW_OFFSET = 12 // forward offset from boat center (scene units)
export const BOAT_STERN_OFFSET = -6 // aft offset from boat center
export const BOAT_LENGTH = BOAT_BOW_OFFSET - BOAT_STERN_OFFSET // total boat length (scene units)

// Wind shadow / wake parameters
export const WAKE_MAX_SLOWDOWN = 0.25 // Max speed reduction (25%)
export const WAKE_LENGTH = 60 // Downwind wake length (scene units)
export const WAKE_HALF_WIDTH_START = 18 // Near-boat half width
export const WAKE_HALF_WIDTH_END = 35 // Wake widens farther downwind
export const WAKE_CONE_HALF_ANGLE_DEG = 35 // Limit wake to downwind sector
export const WAKE_MIN_STRENGTH = 0.01 // Ignore negligible contributions
