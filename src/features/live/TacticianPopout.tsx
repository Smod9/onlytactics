import { KeyboardIcon, LightbulbIcon } from '@/view/icons'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HELP_TIPS } from './helpContent'

const STORAGE_KEY = 'sgame:tacticianOpen'
const NUDGE_KEY = 'sgame:helpNudgeSeen'

const KEYBOARD_LAYOUT_FILE = 'Keyboard Layout.svg'
const KEYBOARD_LAYOUT_SRC = `${import.meta.env.BASE_URL}${encodeURIComponent(KEYBOARD_LAYOUT_FILE)}`

type HelpSection = 'keyboard' | 'tips'

export const TacticianPopout = () => {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? stored === '1' : false
  })
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [section, setSection] = useState<HelpSection>('keyboard')
  const [showNudge, setShowNudge] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(NUDGE_KEY) !== '1'
  })

  const markNudgeSeen = () => {
    setShowNudge(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NUDGE_KEY, '1')
    }
  }

  const toggle = () => {
    setOpen((value) => {
      const next = !value
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      }
      if (next) {
        setSection('keyboard')
        markNudgeSeen()
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
    <div
      className={`tactician-popout${open ? ' open' : ''}${showNudge && !open ? ' nudge' : ''}`}
    >
      <button
        type="button"
        className="tactician-toggle"
        onClick={toggle}
        title="Keyboard help"
      >
        <span className="tactician-toggle-icon" aria-hidden="true">
          ?
        </span>
        <span className="tactician-toggle-text">{open ? 'Close Help' : 'Help'}</span>
      </button>
      {showNudge && !open && (
        <div className="tactician-nudge" aria-hidden="true">
          <span className="keyboard-icon" aria-hidden="true">
            <KeyboardIcon />
          </span>
          Start here 👆
        </div>
      )}
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
            <div
              className="keyboard-help-card"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="keyboard-help-header">
                <div className="keyboard-help-title">Help</div>
                <div
                  className="keyboard-help-tabs"
                  role="tablist"
                  aria-label="Help sections"
                >
                  <button
                    type="button"
                    className={`keyboard-help-tab${section === 'keyboard' ? ' active' : ''}`}
                    onClick={() => setSection('keyboard')}
                    role="tab"
                    aria-selected={section === 'keyboard'}
                  >
                    <span className="keyboard-help-tab-icon" aria-hidden="true">
                      <KeyboardIcon />
                    </span>
                    Keyboard
                  </button>
                  <button
                    type="button"
                    className={`keyboard-help-tab${section === 'tips' ? ' active' : ''}`}
                    onClick={() => setSection('tips')}
                    role="tab"
                    aria-selected={section === 'tips'}
                  >
                    <span className="keyboard-help-tab-icon" aria-hidden="true">
                      <LightbulbIcon />
                    </span>
                    Tips
                  </button>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="keyboard-help-close"
                  onClick={() => close()}
                  aria-label="Close help"
                  title="Close (Esc)"
                >
                  ✕
                </button>
              </div>
              <div className="keyboard-help-body">
                {section === 'keyboard' && (
                  <div
                    className="keyboard-help-section"
                    role="tabpanel"
                    aria-label="Keyboard layout"
                  >
                    <p className="keyboard-help-lead">
                      Keyboard layout (click outside to close).
                    </p>
                    <div className="keyboard-help-layout">
                      <img
                        className="keyboard-help-image"
                        src={KEYBOARD_LAYOUT_SRC}
                        alt="Keyboard layout"
                        draggable={false}
                      />
                    </div>
                  </div>
                )}
                {section === 'tips' && (
                  <div
                    className="keyboard-help-section"
                    role="tabpanel"
                    aria-label="Tips"
                  >
                    <p className="keyboard-help-lead">Quick tips:</p>
                    <ul className="keyboard-help-tips">
                      {HELP_TIPS.map((tip) => (
                        <li key={tip.id}>{tip.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
