import { useState } from 'react'

const STORAGE_KEY = 'sgame:tacticianOpen'

export const TacticianPopout = () => {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? stored === '1' : true
  })

  const toggle = () => {
    setOpen((value) => {
      const next = !value
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      }
      return next
    })
  }

  return (
    <div className={`tactician-popout${open ? ' open' : ''}`}>
      <button
        type="button"
        className="tactician-toggle"
        onClick={toggle}
      >
        {open ? 'Hide Help Menu' : '?'}
      </button>
      {open && (
        <div className="tactician-card">
          <h4>Tactician Controls</h4>
          <ul>
            <li>
              <kbd>Space</kbd> Enter VMG mode (auto VMG heading)
            </li>
            <li>
              <kbd>Enter</kbd> Tack / gybe (locks helm until turn completes)
            </li>
            <li>
              <kbd>↑</kbd> Head up 10°
            </li>
            <li>
              <kbd>↓</kbd> Bear away 10°
            </li>
            <li>
              <kbd>Shift</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd> Hard turn 20°
            </li>
            <li>
              <kbd>Z</kbd> Toggle camera (Follow / Birdseye)
            </li>
            <li>
              <kbd>S</kbd> 360° spin to clear one penalty
            </li>
            <li>
              <kbd>P</kbd> Clear one penalty (no spin)
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

