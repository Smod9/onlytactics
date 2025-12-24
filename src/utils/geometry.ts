import type { Vec2 } from '@/types/race'

export const distanceBetween = (a: Vec2, b: Vec2) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}
