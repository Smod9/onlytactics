import { useEffect, useState } from 'react'

const STORAGE_KEY = 'sgame:onScreenControlsOpen'

const dispatchKey = (code: string, keyOverride?: string) => {
  if (typeof window === 'undefined') return
  const event = new KeyboardEvent('keydown', {
    code,
    key: keyOverride ?? code,
    bubbles: true,
  })
  window.dispatchEvent(event)
}

const prefersTouchControls = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  const isiOS = /ipad|iphone|ipod/.test(ua)
  const isTouchMac = ua.includes('macintosh') && navigator.maxTouchPoints > 1
  return isiOS || isTouchMac
}

type ControlButton = {
  label: string
  subLabel?: string
  code: string
  key?: string
  classes?: string
}

const PORT_CLUSTER: ControlButton[] = [
  { label: 'Trim', subLabel: 'Space', code: 'Space', key: ' ', classes: 'wide' },
]

const PORT_EXTRA_CLUSTER: ControlButton[] = [
  { label: 'Spin', subLabel: 'S', code: 'KeyS', key: 's', classes: 'wide' },
]

const STARBOARD_CLUSTER: ControlButton[] = [
  { label: 'Tack/Gybe', subLabel: 'Enter', code: 'Enter', key: 'Enter', classes: 'wide' },
  { label: 'Head Up', subLabel: '↑', code: 'ArrowUp', key: 'ArrowUp' },
  { label: 'Bear Away', subLabel: '↓', code: 'ArrowDown', key: 'ArrowDown' },
]

export const OnScreenControls = () => {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      return stored === '1'
    }
    return prefersTouchControls()
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  }, [open])

  const handleButton = (button: ControlButton) => {
    dispatchKey(button.code, button.key)
  }

  const renderCluster = (buttons: ControlButton[], side: 'left' | 'right', extra?: boolean) => (
    <div className={`on-screen-cluster ${side}${extra ? ' extras' : ''}`}>
      {buttons.map((button) => (
        <button
          key={button.code}
          type="button"
          className={`on-screen-button${button.classes ? ` ${button.classes}` : ''}`}
          onClick={() => handleButton(button)}
        >
          <span className="on-screen-label">{button.label}</span>
          {button.subLabel && <span className="on-screen-sublabel">{button.subLabel}</span>}
        </button>
      ))}
    </div>
  )

  return (
    <div className={`on-screen-controls${open ? ' open' : ''}`}>
      <button
        type="button"
        className="on-screen-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide Touch Controls' : 'Touch Controls'}
      </button>
      {open && (
        <>
          {renderCluster(PORT_CLUSTER, 'left')}
          {renderCluster(PORT_EXTRA_CLUSTER, 'left', true)}
          {renderCluster(STARBOARD_CLUSTER, 'right')}
        </>
      )}
    </div>
  )
}


