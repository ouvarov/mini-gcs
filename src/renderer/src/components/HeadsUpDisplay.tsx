import { EMPTY_VALUE_TEXT } from '@shared/defaults'
import { DEGREES_PER_RADIAN } from '@shared/units'

import { formatNumber } from '../format'
import { arducopterFlightModeName } from '../telemetry/flightModes'
import { type MergedTelemetry, selectHeadingDegrees } from '../telemetry/mergedTelemetry'

type Props = {
  mergedTelemetry: MergedTelemetry | null
}

type TelemetryCellProps = {
  label: string
  displayText: string
  testId?: string
}

const COORDINATE_DECIMALS = 6
const ALTITUDE_DECIMALS = 1
const SPEED_DECIMALS = 1
const HEADING_DECIMALS = 0
const ATTITUDE_DECIMALS = 1
const VOLTAGE_DECIMALS = 2

const formatFlightMode = (heartbeat: MergedTelemetry['heartbeat']): string =>
  heartbeat
    ? `${arducopterFlightModeName(heartbeat.customMode)}${heartbeat.isArmed ? ' ARMED' : ''}`
    : EMPTY_VALUE_TEXT

const formatAttitude = (attitude: MergedTelemetry['attitude']): string =>
  attitude
    ? `${formatNumber(attitude.rollRadians * DEGREES_PER_RADIAN, ATTITUDE_DECIMALS)} / ${formatNumber(attitude.pitchRadians * DEGREES_PER_RADIAN, ATTITUDE_DECIMALS)}`
    : EMPTY_VALUE_TEXT

const formatGpsFix = (gpsFix: MergedTelemetry['gpsFix']): string =>
  gpsFix ? `${gpsFix.fixType} / ${gpsFix.satelliteCount}` : EMPTY_VALUE_TEXT

const TelemetryCell = ({ label, displayText, testId }: TelemetryCellProps) => (
  <div className="hud__cell">
    <div className="hud__cell-label">{label}</div>
    <div className="hud__cell-value" data-testid={testId}>
      {displayText}
    </div>
  </div>
)

const HeadsUpDisplay = ({ mergedTelemetry }: Props) => {
  if (!mergedTelemetry) return <div className="hud hud--empty">No telemetry yet</div>

  const { position, attitude, vfrHud, battery, gpsFix, heartbeat, statusText } = mergedTelemetry

  return (
    <div className="hud" data-testid="hud">
      <TelemetryCell label="Mode" testId="hud-mode" displayText={formatFlightMode(heartbeat)} />
      <TelemetryCell
        label="Latitude"
        testId="hud-latitude"
        displayText={formatNumber(position?.latitudeDegrees, COORDINATE_DECIMALS)}
      />
      <TelemetryCell
        label="Longitude"
        displayText={formatNumber(position?.longitudeDegrees, COORDINATE_DECIMALS)}
      />
      <TelemetryCell
        label="Altitude above home, m"
        displayText={formatNumber(position?.altitudeAboveHomeMeters, ALTITUDE_DECIMALS)}
      />
      <TelemetryCell
        label="Ground speed, m/s"
        displayText={formatNumber(vfrHud?.groundSpeedMetersPerSecond, SPEED_DECIMALS)}
      />
      <TelemetryCell
        label="Heading, °"
        displayText={formatNumber(selectHeadingDegrees(mergedTelemetry), HEADING_DECIMALS)}
      />
      <TelemetryCell label="Roll / Pitch, °" displayText={formatAttitude(attitude)} />
      <TelemetryCell
        label="Battery, V"
        displayText={formatNumber(battery?.voltageVolts, VOLTAGE_DECIMALS)}
      />
      <TelemetryCell label="GPS fix type / satellites" displayText={formatGpsFix(gpsFix)} />
      {statusText && (
        <div className="hud__status">
          [{statusText.mavlinkSeverityCode}] {statusText.messageText}
        </div>
      )}
    </div>
  )
}

export { HeadsUpDisplay }
