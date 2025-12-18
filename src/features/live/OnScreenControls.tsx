import { useEffect, useState, type ReactNode } from 'react'
import type { CameraMode } from '@/view/scene/RaceScene'
import { ZoomIcon } from '@/view/icons'

const STORAGE_KEY = 'sgame:onScreenControlsOpen'

type KeyModifiers = {
  shiftKey?: boolean
}

const dispatchKey = (code: string, keyOverride?: string, modifiers?: KeyModifiers) => {
  if (typeof window === 'undefined') return
  const event = new KeyboardEvent('keydown', {
    code,
    key: keyOverride ?? code,
    bubbles: true,
    shiftKey: Boolean(modifiers?.shiftKey),
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
  onClick?: () => void
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  }, [open])

  useEffect(() => {
    // Provide a "safe area" hint for other overlays (e.g. chat) when touch controls are open.
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--touch-controls-chat-shift', open ? '9rem' : '0rem')
    return () => {
      document.documentElement.style.setProperty('--touch-controls-chat-shift', '0rem')
    }
  }, [open])

  const handleKeyButton = (button: ControlButton) => {
    const wantsHardTurn = hardTurnHeld && (button.code === 'ArrowUp' || button.code === 'ArrowDown')
    dispatchKey(button.code, button.key, wantsHardTurn ? { shiftKey: true } : undefined)
  }

  const portCluster: TouchButton[] = [
    {
      id: 'hardTurn',
      classes: `wide${hardTurnHeld ? ' active' : ''}`,
      title: 'Hold to make ↑/↓ do 30° turns (Shift modifier)',
      label: '30° Turn',
      subLabel: 'Hold (Shift)',
      onPointerDown: (event) => {
        event.preventDefault()
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
      onClick: () =>
        handleKeyButton({ label: 'Enter VMG', subLabel: 'Space', code: 'Space', key: ' ', classes: 'wide' }),
    },
  ]

  const portExtraCluster: TouchButton[] = [
    {
      id: 'clearPenalty',
      label: 'Clear Penalty',
      subLabel: 'P',
      classes: 'wide',
      onClick: () => handleKeyButton({ label: 'Clear Penalty', subLabel: 'P', code: 'KeyP', key: 'p', classes: 'wide' }),
    },
    {
      id: 'spin',
      label: 'Spin',
      subLabel: 'S',
      classes: 'wide',
      onClick: () => handleKeyButton({ label: 'Spin', subLabel: 'S', code: 'KeyS', key: 's', classes: 'wide' }),
    },
  ]

  const starboardExtraCluster: TouchButton[] = [
    {
      id: 'camera',
      classes: 'wide',
      title: 'Toggle camera mode (Z)',
      onClick: onToggleCamera,
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
      onClick: () => handleKeyButton({ label: 'Tack/Gybe', subLabel: 'Enter', code: 'Enter', key: 'Enter', classes: 'wide' }),
    },
    {
      id: 'headUp',
      label: 'Head Up',
      subLabel: '↑',
      onClick: () => handleKeyButton({ label: 'Head Up', subLabel: '↑', code: 'ArrowUp', key: 'ArrowUp' }),
    },
    {
      id: 'bearAway',
      label: 'Bear Away',
      subLabel: '↓',
      onClick: () => handleKeyButton({ label: 'Bear Away', subLabel: '↓', code: 'ArrowDown', key: 'ArrowDown' }),
    },
  ]

  const renderCluster = (buttons: TouchButton[], side: 'left' | 'right', extra?: boolean) => (
    <div className={`on-screen-cluster ${side}${extra ? ' extras' : ''}`}>
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          className={`on-screen-button${button.classes ? ` ${button.classes}` : ''}`}
          onClick={button.onClick}
          onPointerDown={button.onPointerDown}
          onPointerUp={button.onPointerUp}
          onPointerCancel={button.onPointerCancel}
          onPointerLeave={button.onPointerLeave}
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


