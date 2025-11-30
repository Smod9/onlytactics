import { useMemo } from 'react'
import { useInputTelemetry, useRaceState } from '@/state/hooks'
import { identity } from '@/net/identity'
import { apparentWindAngleSigned, angleDiff } from '@/logic/physics'

const formatAngle = (deg: number) => `${deg.toFixed(1)}°`
const formatSpeed = (speed: number) => `${speed.toFixed(2)} kts`
const formatCoord = (value: number) => `${value.toFixed(1)} m`

type Props = {
  onClose?: () => void
}

export const DebugPanel = ({ onClose }: Props) => {
  const race = useRaceState()
  const telemetry = useInputTelemetry()
  const brokerLabel = 'Broker: CloudAMQP'
  const myLatency = telemetry[identity.boatId]

  const boats = useMemo(
    () =>
      Object.values(race.boats).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [race.boats],
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
        <span>@ {race.wind.speed.toFixed(1)} kts</span>
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
          const headingError = angleDiff(boat.desiredHeadingDeg ?? boat.headingDeg, boat.headingDeg)
          return (
            <div
              key={boat.id}
              className={`debug-table-row${boat.id === identity.boatId ? ' self' : ''}`}
            >
              <span>{boat.name}</span>
              <span>{formatAngle(boat.headingDeg)}</span>
              <span>
                {formatAngle(boat.desiredHeadingDeg ?? boat.headingDeg)} ({headingError.toFixed(1)}°)
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
    </div>
  )
}

