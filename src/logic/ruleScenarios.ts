/**
 * Predefined boat configurations for visual testing of racing rules.
 * Each scenario places two boats in a specific rule situation so the
 * tester can observe whether penalties, repulsion, and UI feedback work.
 *
 * Boat positions are relative to a reference point (typically the first
 * mark or start line). The loader adds the reference offset at load time.
 */

export type ScenarioBoat = {
  offsetX: number
  offsetY: number
  headingDeg: number
}

export type RuleScenario = {
  id: string
  name: string
  description: string
  windDirDeg: number
  boats: [ScenarioBoat, ScenarioBoat]
}

export const ruleScenarios: RuleScenario[] = [
  {
    id: 'port-starboard',
    name: 'Port / Starboard',
    description: 'Port tack boat (A) converging with starboard tack boat (B). Rule 10: A must keep clear.',
    windDirDeg: 0,
    boats: [
      { offsetX: -25, offsetY: 10, headingDeg: 45 },
      { offsetX: 25, offsetY: 10, headingDeg: 315 },
    ],
  },
  {
    id: 'windward-leeward',
    name: 'Windward / Leeward',
    description: 'Same tack, overlapping. Windward boat (A) must keep clear of leeward boat (B). Rule 11.',
    windDirDeg: 0,
    boats: [
      { offsetX: 5, offsetY: -15, headingDeg: 45 },
      { offsetX: 5, offsetY: 0, headingDeg: 50 },
    ],
  },
  {
    id: 'downwind-same-tack',
    name: 'Downwind Same Tack',
    description: 'Both boats running deep downwind, nearly dead downwind. Tests the deep-downwind dead-zone fix.',
    windDirDeg: 0,
    boats: [
      { offsetX: -5, offsetY: 0, headingDeg: 175 },
      { offsetX: 5, offsetY: 5, headingDeg: 178 },
    ],
  },
  {
    id: 'downwind-opposite-tack',
    name: 'Downwind Opposite (Dead-Zone)',
    description: 'Two boats deep downwind on opposite computed tacks (TWA ~179° and ~181°). Should trigger Rule 11 not Rule 10.',
    windDirDeg: 0,
    boats: [
      { offsetX: -5, offsetY: 0, headingDeg: 179 },
      { offsetX: 5, offsetY: 3, headingDeg: 181 },
    ],
  },
  {
    id: 'stern-rammer',
    name: 'Stern Rammer',
    description: 'Boat B trailing directly behind Boat A on the same tack. B (overtaking) must keep clear.',
    windDirDeg: 0,
    boats: [
      { offsetX: 0, offsetY: -15, headingDeg: 45 },
      { offsetX: -20, offsetY: 15, headingDeg: 38 },
    ],
  },
  {
    id: 'prestart-ocs',
    name: 'Pre-Start OCS',
    description: 'One boat over the start line before the gun. Tests OCS detection (Rule 29).',
    windDirDeg: 0,
    boats: [
      { offsetX: 0, offsetY: -30, headingDeg: 0 },
      { offsetX: 15, offsetY: 10, headingDeg: 350 },
    ],
  },
  {
    id: 'head-on-collision',
    name: 'Head-On Collision',
    description: 'Two boats heading directly at each other. Tests repulsion physics.',
    windDirDeg: 0,
    boats: [
      { offsetX: 0, offsetY: -15, headingDeg: 180 },
      { offsetX: 0, offsetY: 15, headingDeg: 0 },
    ],
  },
]
