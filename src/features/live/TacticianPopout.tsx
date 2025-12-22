import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'sgame:tacticianOpen'

const KEYBOARD_LAYOUT_FILE = 'Keyboard Layout.svg'
const KEYBOARD_LAYOUT_SRC = `${import.meta.env.BASE_URL}${encodeURIComponent(KEYBOARD_LAYOUT_FILE)}`

export const TacticianPopout = () => {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? stored === '1' : true
  })
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const toggle = () => {
    setOpen((value) => {
      const next = !value
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      }
      return next
    })
  }

  const close = () => {
    setOpen(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, '0')
    }
  }

  useEffect(() => {
    if (!open) return

    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className={`tactician-popout${open ? ' open' : ''}`}>
      <button
        type="button"
        className="tactician-toggle"
        onClick={toggle}
      >
        <span className="tactician-toggle-icon" aria-hidden="true">
          ?
        </span>
        <span className="tactician-toggle-text">{open ? 'Close Help' : 'Help'}</span>
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="keyboard-help-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard help"
            onMouseDown={() => close()}
          >
            <div className="keyboard-help-card">
              <button
                ref={closeButtonRef}
                type="button"
                className="keyboard-help-close"
                onClick={() => close()}
                aria-label="Close keyboard help"
                title="Close (Esc)"
              >
                ✕
              </button>
              <img
                className="keyboard-help-image"
                src={KEYBOARD_LAYOUT_SRC}
                alt="Keyboard layout"
                draggable={false}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

