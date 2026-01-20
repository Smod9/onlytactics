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
export const MAX_REVERSE_SPEED_KTS = 0 //Max reverse speed when blowing sails (L key)
export const LEEWARD_DRIFT_SPEED_KTS = 1.3 //Leeward drift when speed is zero or less

// Collision footprint (capsule-like: small bow circle + larger stern circle)
export const BOAT_BOW_RADIUS = 4.5
export const BOAT_STERN_RADIUS = 9
export const BOAT_BOW_OFFSET = 12 // forward offset from boat center (scene units)
export const BOAT_STERN_OFFSET = -6 // aft offset from boat center
export const BOAT_LENGTH = BOAT_BOW_OFFSET - BOAT_STERN_OFFSET // total boat length (scene units)
export const WAKE_FORWARD_OFFSET_MAX = BOAT_LENGTH * 0.6 // Forward shift when deep downwind

// Mark collision radii (aligned with RaceScene drawing sizes)
export const MARK_COLLIDER_RADIUS = 6
export const GATE_COLLIDER_RADIUS = 7

// Collision speed multipliers
export const COLLISION_SLOWDOWN_AT_FAULT = 0.35

// Wind shadow / wake parameters
export const WAKE_MAX_SLOWDOWN = 0.4 // Max speed reduction (25%)
export const WAKE_LENGTH = 123 // Downwind wake length (scene units)
export const WAKE_HALF_WIDTH_START = 25 // Near-boat half width
export const WAKE_HALF_WIDTH_END = 17 // Wake narrows farther downwind
export const WAKE_WIDTH_CURVE = 0.4 // >1 narrows faster downwind
export const WAKE_LEEWARD_WIDTH_MULT = 2.3 // Leeward side width multiplier
export const WAKE_WINDWARD_WIDTH_MULT = 1.3 // Windward side width multiplier
export const WAKE_BIAS_DEG = -35 // Leeward bias away from pure downwind
export const WAKE_TWA_ROTATION_SCALE_UPWIND = 0.12 // Rotation scale upwind
export const WAKE_TWA_ROTATION_SCALE_DOWNWIND = 0.42 // Rotation scale deep downwind
export const WAKE_CORE_HALF_ANGLE_DEG = 9.5 // Core blanket width
export const WAKE_TURB_HALF_ANGLE_DEG = 13.5 // Turbulent zone width
export const WAKE_CORE_STRENGTH = 0.85 // Core blanket strength
export const WAKE_TURB_STRENGTH = 0.4 // Turbulent zone strength
export const WAKE_CORE_MAX_SLOWDOWN = 0.4 // Core blanket max slowdown
export const WAKE_TURB_MAX_SLOWDOWN = 0.25 // Turbulent zone max slowdown
export const WAKE_MIN_STRENGTH = 0.015 // Ignore negligible contributions
