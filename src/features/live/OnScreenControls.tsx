import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CameraMode } from '@/view/scene/RaceScene'
import { ZoomIcon } from '@/view/icons'

const STORAGE_KEY = 'sgame:onScreenControlsOpen'

type KeyModifiers = {
  shiftKey?: boolean
  altKey?: boolean
}

const dispatchKey = (code: string, keyOverride?: string, modifiers?: KeyModifiers) => {
  if (typeof window === 'undefined') return
  const event = new KeyboardEvent('keydown', {
    code,
    key: keyOverride ?? code,
    bubbles: true,
    shiftKey: Boolean(modifiers?.shiftKey),
    altKey: Boolean(modifiers?.altKey),
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

type TouchButton = {
  id: string
  label: ReactNode
  subLabel?: ReactNode
  classes?: string
  title?: string
  onClick?: (modifiers?: KeyModifiers) => void
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
  onPointerUp?: () => void
  onPointerCancel?: () => void
  onPointerLeave?: () => void
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
}

type Props = {
  cameraMode: CameraMode
  onToggleCamera: () => void
}

export const OnScreenControls = ({ cameraMode, onToggleCamera }: Props) => {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      return stored === '1'
    }
    return prefersTouchControls()
  })
  const [hardTurnHeld, setHardTurnHeld] = useState(false)
  const [pressedId, setPressedId] = useState<string | null>(null)
  const lastTouchPressRef = useRef<{ id: string; at: number } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  }, [open])

  useEffect(() => {
    // Provide a "safe area" hint for other overlays (e.g. chat) when touch controls are open.
    if (typeof document === 'undefined') return
    const media =
      typeof window === 'undefined'
        ? null
        : window.matchMedia('(orientation: landscape) and (max-width: 1100px)')

    const apply = () => {
      // On small landscape screens (iPad mini), chat is better anchored from the bottom,
      // and needs a larger offset to clear the control clusters.
      const shift = open ? (media?.matches ? '15rem' : '9rem') : '0rem'
      document.documentElement.style.setProperty('--touch-controls-chat-shift', shift)
    }

    apply()
    media?.addEventListener?.('change', apply)
    return () => {
      document.documentElement.style.setProperty('--touch-controls-chat-shift', '0rem')
      media?.removeEventListener?.('change', apply)
    }
  }, [open])

  const handleKeyButtonWithModifiers = (button: ControlButton, modifiers?: KeyModifiers) => {
    const isArrow = button.code === 'ArrowUp' || button.code === 'ArrowDown'
    const wantsHardTurn = isArrow && (hardTurnHeld || Boolean(modifiers?.shiftKey) || Boolean(modifiers?.altKey))
    dispatchKey(
      button.code,
      button.key,
      wantsHardTurn ? { shiftKey: Boolean(modifiers?.shiftKey) || hardTurnHeld, altKey: Boolean(modifiers?.altKey) } : modifiers,
    )
  }

  const markPressed = (id: string) => setPressedId(id)
  const clearPressed = (id: string) => {
    setPressedId((current) => (current === id ? null : current))
  }

  const noteTouchPress = (id: string, timeStamp: number) => {
    lastTouchPressRef.current = { id, at: timeStamp }
  }

  const shouldIgnoreClick = (id: string, timeStamp: number) => {
    const last = lastTouchPressRef.current
    if (!last) return false
    if (last.id !== id) return false
    // If we already handled this button via touch pointer events, ignore the synthetic click.
    return timeStamp - last.at < 800
  }

  const portCluster: TouchButton[] = [
    {
      id: 'hardTurn',
      classes: `wide${hardTurnHeld ? ' active' : ''}`,
      title: 'Hold to make ↑/↓ do 20° turns (Shift/Alt modifier)',
      label: '20° Turn',
      subLabel: 'SHIFT (Hold + ↑/↓)',
      onPointerDown: (event) => {
        if (event.pointerType === 'touch') event.preventDefault()
        setHardTurnHeld(true)
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Ignore if not supported
        }
      },
      onPointerUp: () => setHardTurnHeld(false),
      onPointerCancel: () => setHardTurnHeld(false),
      onPointerLeave: () => setHardTurnHeld(false),
      onContextMenu: (event) => event.preventDefault(),
    },
    {
      id: 'trim',
      label: 'Enter VMG',
      subLabel: 'Space',
      classes: 'wide',
      onClick: (modifiers) =>
        handleKeyButtonWithModifiers(
          { label: 'Enter VMG', subLabel: 'Space', code: 'Space', key: ' ', classes: 'wide' },
          modifiers,
        ),
    },
  ]

  const portExtraCluster: TouchButton[] = [
    {
      id: 'clearPenalty',
      label: 'Clear Penalty',
      subLabel: 'P',
      classes: 'wide',
      onClick: (modifiers) =>
        handleKeyButtonWithModifiers(
          { label: 'Clear Penalty', subLabel: 'P', code: 'KeyP', key: 'p', classes: 'wide' },
          modifiers,
        ),
    },
    {
      id: 'spin',
      label: 'Spin',
      subLabel: 'S',
      classes: 'wide',
      onClick: (modifiers) =>
        handleKeyButtonWithModifiers(
          { label: 'Spin', subLabel: 'S', code: 'KeyS', key: 's', classes: 'wide' },
          modifiers,
        ),
    },
  ]

  const starboardExtraCluster: TouchButton[] = [
    {
      id: 'camera',
      classes: 'wide',
      title: 'Toggle camera mode (Z)',
      onClick: () => onToggleCamera(),
      label: (
        <>
          <span className="camera-toggle-icon" aria-hidden="true">
            <ZoomIcon />
          </span>{' '}
          {cameraMode === 'follow' ? 'Birdseye' : 'Follow'}
        </>
      ),
      subLabel: 'Z',
    },
  ]

  const starboardCluster: TouchButton[] = [
    {
      id: 'tackGybe',
      label: 'Tack/Gybe',
      subLabel: 'Enter',
      classes: 'wide',
      onClick: (modifiers) =>
        handleKeyButtonWithModifiers(
          { label: 'Tack/Gybe', subLabel: 'Enter', code: 'Enter', key: 'Enter', classes: 'wide' },
          modifiers,
        ),
    },
    {
      id: 'headUp',
      label: 'Head Up',
      subLabel: '↑',
      onClick: (modifiers) =>
        handleKeyButtonWithModifiers(
          { label: 'Head Up', subLabel: '↑', code: 'ArrowUp', key: 'ArrowUp' },
          modifiers,
        ),
    },
    {
      id: 'bearAway',
      label: 'Bear Away',
      subLabel: '↓',
      onClick: (modifiers) =>
        handleKeyButtonWithModifiers(
          { label: 'Bear Away', subLabel: '↓', code: 'ArrowDown', key: 'ArrowDown' },
          modifiers,
        ),
    },
  ]

  const handlePointerDown = (button: TouchButton, event: React.PointerEvent<HTMLButtonElement>) => {
    markPressed(button.id)
    if (event.pointerType === 'touch') {
      event.preventDefault()
      noteTouchPress(button.id, event.timeStamp)
      // iOS Safari can suppress/delay click when preventDefault is involved; treat touch as "press" now.
      button.onClick?.({ shiftKey: event.shiftKey, altKey: event.altKey })
    }
    button.onPointerDown?.(event)
  }

  const handlePointerUp = (button: TouchButton) => {
    clearPressed(button.id)
    button.onPointerUp?.()
  }

  const handlePointerCancel = (button: TouchButton) => {
    clearPressed(button.id)
    button.onPointerCancel?.()
  }

  const handlePointerLeave = (button: TouchButton) => {
    clearPressed(button.id)
    button.onPointerLeave?.()
  }

  const handleClick = (button: TouchButton, modifiers: KeyModifiers, timeStamp: number) => {
    if (shouldIgnoreClick(button.id, timeStamp)) return
    // If the platform doesn't reliably fire :active, provide a short "pressed" flash.
    markPressed(button.id)
    window.setTimeout(() => clearPressed(button.id), 120)
    button.onClick?.(modifiers)
  }

  const renderCluster = (buttons: TouchButton[], side: 'left' | 'right', extra?: boolean) => (
    <div className={`on-screen-cluster ${side}${extra ? ' extras' : ''}`}>
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          className={`on-screen-button${button.classes ? ` ${button.classes}` : ''}${
            pressedId === button.id ? ' pressed' : ''
          }`}
          onClick={(event) =>
            handleClick(button, { shiftKey: event.shiftKey, altKey: event.altKey }, event.timeStamp)
          }
          onPointerDown={(event) => handlePointerDown(button, event)}
          onPointerUp={() => handlePointerUp(button)}
          onPointerCancel={() => handlePointerCancel(button)}
          onPointerLeave={() => handlePointerLeave(button)}
          onContextMenu={button.onContextMenu}
          title={button.title}
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
          {renderCluster(portCluster, 'left', false)}
          {renderCluster(portExtraCluster, 'left', true)}
          {renderCluster(starboardExtraCluster, 'right', true)}
          {renderCluster(starboardCluster, 'right')}
        </>
      )}
    </div>
  )
}


