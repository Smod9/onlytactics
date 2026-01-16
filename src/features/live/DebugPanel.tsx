import { useMemo } from 'react'
import { useInputTelemetry, useRaceState, useWakeTuning } from '@/state/hooks'
import { identity } from '@/net/identity'
import { apparentWindAngleSigned, angleDiff } from '@/logic/physics'
import { sampleWindSpeed } from '@/logic/windField'
import { appEnv } from '@/config/env'
import {
  resetWakeTuning,
  setWakeTuningEnabled,
  updateWakeTuning,
  wakeTuningDefaults,
} from '@/logic/wakeTuning'
import type { GameNetwork } from '@/net/gameNetwork'

const formatAngle = (deg: number) => `${deg.toFixed(1)}°`
const formatSpeed = (speed: number) => `${speed.toFixed(2)} kts`
const formatCoord = (value: number) => `${value.toFixed(1)} m`

type Props = {
  onClose?: () => void
  network?: GameNetwork
}

export const DebugPanel = ({ onClose, network }: Props) => {
  const race = useRaceState()
  const telemetry = useInputTelemetry()
  const wakeState = useWakeTuning()
  const brokerLabel = 'Broker: CloudAMQP'
  const myLatency = telemetry[identity.boatId]
  const myBoat = race.boats[identity.boatId]
  const localWindSpeed = myBoat ? sampleWindSpeed(race, myBoat.pos) : race.wind.speed

  const boats = useMemo(
    () => Object.values(race.boats).sort((a, b) => a.name.localeCompare(b.name)),
    [race.boats],
  )
  const isHost = race.hostId === identity.clientId
  const showHostDebug = appEnv.debugHud && isHost && network

  const wake = wakeState.tuning
  const setWakeValue = <K extends keyof typeof wake>(key: K, value: number) => {
    updateWakeTuning({ [key]: value } as Partial<typeof wake>)
  }
  const formatConst = (name: string, value: number) =>
    `export const ${name} = ${Number(value.toFixed(3))}`
  const wakeConstantsText = useMemo(
    () =>
      [
        formatConst('WAKE_LENGTH', wake.length),
        formatConst('WAKE_HALF_WIDTH_START', wake.widthStart),
        formatConst('WAKE_HALF_WIDTH_END', wake.widthEnd),
        formatConst('WAKE_WIDTH_CURVE', wake.widthCurve),
        formatConst('WAKE_LEEWARD_WIDTH_MULT', wake.leewardWidthMult),
        formatConst('WAKE_WINDWARD_WIDTH_MULT', wake.windwardWidthMult),
        formatConst('WAKE_BIAS_DEG', wake.biasDeg),
        formatConst('WAKE_TWA_ROTATION_SCALE_UPWIND', wake.twaRotationScaleUpwind),
        formatConst('WAKE_TWA_ROTATION_SCALE_DOWNWIND', wake.twaRotationScaleDownwind),
        formatConst('WAKE_CORE_HALF_ANGLE_DEG', wake.coreHalfAngleDeg),
        formatConst('WAKE_TURB_HALF_ANGLE_DEG', wake.turbHalfAngleDeg),
        formatConst('WAKE_CORE_STRENGTH', wake.coreStrength),
        formatConst('WAKE_TURB_STRENGTH', wake.turbStrength),
        formatConst('WAKE_CORE_MAX_SLOWDOWN', wake.coreMaxSlowdown),
        formatConst('WAKE_TURB_MAX_SLOWDOWN', wake.turbMaxSlowdown),
        formatConst('WAKE_MAX_SLOWDOWN', wake.maxSlowdown),
        formatConst('WAKE_MIN_STRENGTH', wake.minStrength),
      ].join('\n'),
    [wake],
  )
  const copyWakeConstants = async () => {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(wakeConstantsText)
      return
    }
    console.info('[wake-tuning] constants\n', wakeConstantsText)
  }

  const renderControl = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (next: number) => void,
  ) => (
    <div className="debug-row">
      <strong>{label}:</strong>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value.toFixed(3))}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )

  return (
    <div className="debug-panel">
      {onClose && (
        <button type="button" className="debug-close" onClick={onClose}>
          ×
        </button>
      )}
      <div className="debug-row">
        <strong>Wind:</strong>
        <span>{formatAngle(race.wind.directionDeg)}</span>
        <span>@ {localWindSpeed.toFixed(1)} kts</span>
      </div>
      <div className="debug-row">
        <strong>Phase:</strong>
        <span>{race.phase}</span>
        <strong>t:</strong>
        <span>{race.t.toFixed(1)} s</span>
      </div>
      <div className="debug-row">
        <strong>{brokerLabel}</strong>
      </div>
      <div className="debug-row">
        <strong>Input RTT:</strong>
        <span>
          {myLatency
            ? `${myLatency.latencyMs.toFixed(0)} ms (seq ${myLatency.seq})`
            : 'n/a'}
        </span>
      </div>
      <div className="debug-table">
        <div className="debug-table-header">
          <span>Wake tuning</span>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="debug-row">
          <strong>Enabled:</strong>
          <label>
            <input
              type="checkbox"
              checked={wakeState.enabled}
              onChange={(event) => setWakeTuningEnabled(event.target.checked)}
            />
            apply overrides
          </label>
          <button type="button" onClick={() => resetWakeTuning()}>
            Reset defaults
          </button>
          <button type="button" onClick={() => copyWakeConstants()}>
            Copy constants
          </button>
        </div>
        {renderControl('Length', wake.length, 20, 240, 1, (value) =>
          setWakeValue('length', value),
        )}
        {renderControl('Width start', wake.widthStart, 5, 80, 1, (value) =>
          setWakeValue('widthStart', value),
        )}
        {renderControl('Width end', wake.widthEnd, 2, 60, 1, (value) =>
          setWakeValue('widthEnd', value),
        )}
        {renderControl('Width curve', wake.widthCurve, 0.4, 3, 0.05, (value) =>
          setWakeValue('widthCurve', value),
        )}
        {renderControl(
          'Leeward mult',
          wake.leewardWidthMult,
          0.2,
          4,
          0.05,
          (value) => setWakeValue('leewardWidthMult', value),
        )}
        {renderControl(
          'Windward mult',
          wake.windwardWidthMult,
          0.1,
          2,
          0.05,
          (value) => setWakeValue('windwardWidthMult', value),
        )}
        {renderControl('Bias deg', wake.biasDeg, -90, 90, 1, (value) =>
          setWakeValue('biasDeg', value),
        )}
        {renderControl(
          'TWA rot upwind',
          wake.twaRotationScaleUpwind,
          0,
          1,
          0.02,
          (value) => setWakeValue('twaRotationScaleUpwind', value),
        )}
        {renderControl(
          'TWA rot downwind',
          wake.twaRotationScaleDownwind,
          0,
          1,
          0.02,
          (value) => setWakeValue('twaRotationScaleDownwind', value),
        )}
        {renderControl(
          'Core half angle',
          wake.coreHalfAngleDeg,
          2,
          30,
          0.5,
          (value) => setWakeValue('coreHalfAngleDeg', value),
        )}
        {renderControl(
          'Turb half angle',
          wake.turbHalfAngleDeg,
          4,
          45,
          0.5,
          (value) => setWakeValue('turbHalfAngleDeg', value),
        )}
        {renderControl('Core strength', wake.coreStrength, 0, 2, 0.05, (value) =>
          setWakeValue('coreStrength', value),
        )}
        {renderControl('Turb strength', wake.turbStrength, 0, 2, 0.05, (value) =>
          setWakeValue('turbStrength', value),
        )}
        {renderControl(
          'Core max slow',
          wake.coreMaxSlowdown,
          0,
          1,
          0.02,
          (value) => setWakeValue('coreMaxSlowdown', value),
        )}
        {renderControl(
          'Turb max slow',
          wake.turbMaxSlowdown,
          0,
          1,
          0.02,
          (value) => setWakeValue('turbMaxSlowdown', value),
        )}
        {renderControl('Max slow', wake.maxSlowdown, 0.05, 0.9, 0.02, (value) =>
          setWakeValue('maxSlowdown', value),
        )}
        {renderControl('Min strength', wake.minStrength, 0, 0.2, 0.005, (value) =>
          setWakeValue('minStrength', value),
        )}
        <div className="debug-row">
          <strong>Defaults:</strong>
          <span>
            width {wakeTuningDefaults.widthStart}→{wakeTuningDefaults.widthEnd},
            length {wakeTuningDefaults.length}
          </span>
        </div>
      </div>
      <div className="debug-table">
        <div className="debug-table-header">
          <span>Boat</span>
          <span>Heading</span>
          <span>Desired</span>
          <span>AWA</span>
          <span>Speed</span>
          <span>Stall</span>
          <span>Pos X</span>
          <span>Pos Y</span>
        </div>
        {boats.map((boat) => {
          const awa = apparentWindAngleSigned(boat.headingDeg, race.wind.directionDeg)
          const headingError = angleDiff(
            boat.desiredHeadingDeg ?? boat.headingDeg,
            boat.headingDeg,
          )
          return (
            <div
              key={boat.id}
              className={`debug-table-row${boat.id === identity.boatId ? ' self' : ''}`}
            >
              <span>{boat.name}</span>
              <span>{formatAngle(boat.headingDeg)}</span>
              <span>
                {formatAngle(boat.desiredHeadingDeg ?? boat.headingDeg)} (
                {headingError.toFixed(1)}°)
              </span>
              <span>{formatAngle(awa)}</span>
              <span>{formatSpeed(boat.speed)}</span>
              <span>{boat.stallTimer.toFixed(1)} s</span>
              <span>{formatCoord(boat.pos.x)}</span>
              <span>{formatCoord(boat.pos.y)}</span>
            </div>
          )
        })}
      </div>
      <div className="debug-table">
        <div className="debug-table-header">
          <span>Boat</span>
          <span>Seq</span>
          <span>RTT</span>
        </div>
        {boats.map((boat) => {
          const data = telemetry[boat.id]
          return (
            <div
              key={`${boat.id}-telemetry`}
              className={`debug-table-row${boat.id === identity.boatId ? ' self' : ''}`}
            >
              <span>{boat.name}</span>
              <span>{data?.seq ?? '—'}</span>
              <span>{data ? `${data.latencyMs.toFixed(0)} ms` : '—'}</span>
            </div>
          )
        })}
      </div>
      {showHostDebug && (
        <div className="debug-table">
          <div className="debug-table-header">
            <span>Boat</span>
            <span>Lap</span>
            <span>Actions</span>
          </div>
          {boats.map((boat) => (
            <div key={`${boat.id}-laps`} className="debug-table-row">
              <span>{boat.name}</span>
              <span>{(boat.lap ?? 0) + 1}</span>
              <span className="debug-actions">
                <button
                  type="button"
                  onClick={() => network.debugJumpBoatToNextMark(boat.id)}
                >
                  Jump
                </button>
                <button
                  type="button"
                  onClick={() => network.debugAdvanceBoatLap(boat.id)}
                >
                  + Lap
                </button>
                <button type="button" onClick={() => network.debugFinishBoat(boat.id)}>
                  Finish
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
