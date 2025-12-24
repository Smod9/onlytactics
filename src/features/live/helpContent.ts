export type HelpTip = {
  id: string
  text: string
}

export const HELP_TIPS: HelpTip[] = [
  {
    id: 'vmg',
    text: "🏎️ Smash 'space' after tacking to go into VMG mode. This is great for staying fast upwind/downwind.",
  },
  {
    id: 'blow-sails',
    text: "🪂 Hold 'L' to blow the sails (depower) and slow down without changing course.",
  },
  {
    id: 'sharp-turns',
    text: "↪️ Hold 'shift' key while turning to make harder turns. This is great for getting out of trouble.",
  },
  {
    id: 'slow-mode',
    text: "🐢 Repeatedly hitting the up arrow ('↑' key) will keep you slow (roughly 10% of TWS). This is great for parking at the start, and a single tap can help 'shoot the moon' around the windward mark.",
  },
  {
    id: 'follow-boat',
    text: "🔍 Use 'follow' zoom ('z' key) at the start and mark roundings so that you can see what's going on.",
  },
  {
    id: 'birdseye',
    text: "🔍 Zoom back out ('z' key) to make sure you can see what everyone else (and the wind) is doing.",
  },
  {
    id: 'touch-controls',
    text: '📲 On mobile, enable “Touch Controls” at the bottom to get big buttons for the main actions.',
  },
  {
    id: 'sail-fast',
    text: '🏅 Sail fast! Win the start, tack on the knocks, stay in-phase, try to be in the puffs, and cover the boats behind you 🤗.',
  },
]
