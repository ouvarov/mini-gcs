/** Fake MAVLink vehicle: circle over Kyiv, telemetry over UDP. Not a flight model. */
import dgram from 'node:dgram'

import { type MavLinkData, MavLinkProtocolV2, common, minimal } from 'node-mavlink'

import { SEQUENCE_NUMBER_MODULO } from '../src/main/link/sequenceGap'
import {
  ARDUCOPTER_GUIDED_MODE,
  DEFAULT_GCS_UDP_PORT,
  DEMO_HOME_POINT,
  LOCALHOST_ADDRESS,
} from '../src/shared/defaults'
import {
  CENTIAMPERES_PER_AMPERE,
  CENTIDEGREES_PER_DEGREE,
  CENTIMETERS_PER_METER,
  DEGREES_E7_PER_DEGREE,
  DEGREES_PER_RADIAN,
  METERS_PER_DEGREE_LATITUDE,
  MILLIMETERS_PER_METER,
  MILLISECONDS_PER_SECOND,
  MILLIVOLTS_PER_VOLT,
} from '../src/shared/units'

import { parseCommandLineOptions } from './cli-options'

const commandLineOptions = parseCommandLineOptions(process.argv.slice(2))
const targetUdpPort = commandLineOptions.readNumber('port', DEFAULT_GCS_UDP_PORT)
const targetUdpHost = commandLineOptions.readString('host', LOCALHOST_ADDRESS)
const telemetrySendRateHz = commandLineOptions.readNumber('rate', 10)
const packetLossProbability = commandLineOptions.readNumber('loss', 0)
const maxSendJitterMs = commandLineOptions.readNumber('jitter', 0)

const VEHICLE_SYSTEM_ID = 1
const VEHICLE_COMPONENT_ID = 1
const MAVLINK_VERSION = 3
const HEARTBEAT_INTERVAL_MS = 1000
const SLOW_TELEMETRY_INTERVAL_MS = 2000
const CIRCLE_RADIUS_METERS = 400
const CRUISE_SPEED_METERS_PER_SECOND = 15
const ALTITUDE_ABOVE_HOME_METERS = 120
const HOME_ALTITUDE_ABOVE_SEA_LEVEL_METERS = 180
const BANK_ANGLE_RADIANS = 0.25
const PITCH_ANGLE_RADIANS = -0.03
const THROTTLE_PERCENT = 55
const FULL_BATTERY_VOLTS = 16.8
const BATTERY_DRAIN_VOLTS_PER_SECOND = 0.002
const BATTERY_CURRENT_AMPERES = 18.5
const BATTERY_DRAIN_PERCENT_PER_SECOND = 1 / 60
const GPS_FIX_TYPE_3D = 3
const GPS_SATELLITE_COUNT = 14

type CircleState = {
  latitudeDegrees: number
  longitudeDegrees: number
  velocityNorthMetersPerSecond: number
  velocityEastMetersPerSecond: number
  headingDegrees: number
}

const udpSocket = dgram.createSocket('udp4')
const mavlinkProtocol = new MavLinkProtocolV2(VEHICLE_SYSTEM_ID, VEHICLE_COMPONENT_ID)
let nextSequenceNumber = 0
const startedAtEpochMs = Date.now()

const secondsSinceStart = (): number => (Date.now() - startedAtEpochMs) / MILLISECONDS_PER_SECOND

const advanceSequenceNumber = (): void => {
  nextSequenceNumber = (nextSequenceNumber + 1) % SEQUENCE_NUMBER_MODULO
}

const sendMavlinkMessage = (message: MavLinkData): void => {
  if (Math.random() < packetLossProbability) {
    advanceSequenceNumber() // drop the packet but burn the seq so the GCS sees a gap
    return
  }
  const serializedPacket = mavlinkProtocol.serialize(message, nextSequenceNumber)
  advanceSequenceNumber()
  const sendDelayMs = maxSendJitterMs > 0 ? Math.random() * maxSendJitterMs : 0
  setTimeout(() => udpSocket.send(serializedPacket, targetUdpPort, targetUdpHost), sendDelayMs)
}

const computeCircleState = (elapsedSeconds: number): CircleState => {
  const angularSpeedRadiansPerSecond = CRUISE_SPEED_METERS_PER_SECOND / CIRCLE_RADIUS_METERS
  const angleRadians = angularSpeedRadiansPerSecond * elapsedSeconds
  const offsetEastMeters = CIRCLE_RADIUS_METERS * Math.cos(angleRadians)
  const offsetNorthMeters = CIRCLE_RADIUS_METERS * Math.sin(angleRadians)
  const velocityNorthMetersPerSecond =
    -CIRCLE_RADIUS_METERS * angularSpeedRadiansPerSecond * Math.sin(angleRadians)
  const velocityEastMetersPerSecond =
    CIRCLE_RADIUS_METERS * angularSpeedRadiansPerSecond * Math.cos(angleRadians)
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos(DEMO_HOME_POINT.latitudeDegrees / DEGREES_PER_RADIAN)
  return {
    latitudeDegrees:
      DEMO_HOME_POINT.latitudeDegrees + offsetNorthMeters / METERS_PER_DEGREE_LATITUDE,
    longitudeDegrees:
      DEMO_HOME_POINT.longitudeDegrees + offsetEastMeters / metersPerDegreeLongitude,
    velocityNorthMetersPerSecond,
    velocityEastMetersPerSecond,
    headingDegrees:
      (Math.atan2(velocityEastMetersPerSecond, velocityNorthMetersPerSecond) * DEGREES_PER_RADIAN +
        360) %
      360,
  }
}

const buildHeartbeat = (): minimal.Heartbeat => {
  const heartbeatMessage = new minimal.Heartbeat()
  heartbeatMessage.type = minimal.MavType.QUADROTOR
  heartbeatMessage.autopilot = minimal.MavAutopilot.ARDUPILOTMEGA
  heartbeatMessage.baseMode =
    minimal.MavModeFlag.SAFETY_ARMED |
    minimal.MavModeFlag.GUIDED_ENABLED |
    minimal.MavModeFlag.STABILIZE_ENABLED |
    minimal.MavModeFlag.CUSTOM_MODE_ENABLED
  heartbeatMessage.customMode = ARDUCOPTER_GUIDED_MODE
  heartbeatMessage.systemStatus = minimal.MavState.ACTIVE
  heartbeatMessage.mavlinkVersion = MAVLINK_VERSION
  return heartbeatMessage
}

const buildGlobalPosition = (
  circleState: CircleState,
  timeSinceBootMs: number
): common.GlobalPositionInt => {
  const globalPositionMessage = new common.GlobalPositionInt()
  globalPositionMessage.timeBootMs = timeSinceBootMs
  globalPositionMessage.lat = Math.round(circleState.latitudeDegrees * DEGREES_E7_PER_DEGREE)
  globalPositionMessage.lon = Math.round(circleState.longitudeDegrees * DEGREES_E7_PER_DEGREE)
  globalPositionMessage.alt = Math.round(
    (ALTITUDE_ABOVE_HOME_METERS + HOME_ALTITUDE_ABOVE_SEA_LEVEL_METERS) * MILLIMETERS_PER_METER
  )
  globalPositionMessage.relativeAlt = Math.round(ALTITUDE_ABOVE_HOME_METERS * MILLIMETERS_PER_METER)
  globalPositionMessage.vx = Math.round(
    circleState.velocityNorthMetersPerSecond * CENTIMETERS_PER_METER
  )
  globalPositionMessage.vy = Math.round(
    circleState.velocityEastMetersPerSecond * CENTIMETERS_PER_METER
  )
  globalPositionMessage.vz = 0
  globalPositionMessage.hdg = Math.round(circleState.headingDegrees * CENTIDEGREES_PER_DEGREE)
  return globalPositionMessage
}

const buildAttitude = (circleState: CircleState, timeSinceBootMs: number): common.Attitude => {
  const attitudeMessage = new common.Attitude()
  attitudeMessage.timeBootMs = timeSinceBootMs
  attitudeMessage.roll = BANK_ANGLE_RADIANS
  attitudeMessage.pitch = PITCH_ANGLE_RADIANS
  attitudeMessage.yaw = circleState.headingDegrees / DEGREES_PER_RADIAN
  return attitudeMessage
}

const buildVfrHud = (circleState: CircleState): common.VfrHud => {
  const vfrHudMessage = new common.VfrHud()
  vfrHudMessage.airspeed = CRUISE_SPEED_METERS_PER_SECOND
  vfrHudMessage.groundspeed = CRUISE_SPEED_METERS_PER_SECOND
  vfrHudMessage.heading = Math.round(circleState.headingDegrees)
  vfrHudMessage.throttle = THROTTLE_PERCENT
  vfrHudMessage.alt = ALTITUDE_ABOVE_HOME_METERS + HOME_ALTITUDE_ABOVE_SEA_LEVEL_METERS
  vfrHudMessage.climb = 0
  return vfrHudMessage
}

const buildSysStatus = (elapsedSeconds: number): common.SysStatus => {
  const sysStatusMessage = new common.SysStatus()
  sysStatusMessage.voltageBattery = Math.round(
    (FULL_BATTERY_VOLTS - elapsedSeconds * BATTERY_DRAIN_VOLTS_PER_SECOND) * MILLIVOLTS_PER_VOLT
  )
  sysStatusMessage.currentBattery = Math.round(BATTERY_CURRENT_AMPERES * CENTIAMPERES_PER_AMPERE)
  sysStatusMessage.batteryRemaining = Math.max(
    0,
    Math.round(100 - elapsedSeconds * BATTERY_DRAIN_PERCENT_PER_SECOND)
  )
  return sysStatusMessage
}

const buildGpsRaw = (): common.GpsRawInt => {
  const gpsRawMessage = new common.GpsRawInt()
  gpsRawMessage.fixType = GPS_FIX_TYPE_3D
  gpsRawMessage.satellitesVisible = GPS_SATELLITE_COUNT
  return gpsRawMessage
}

const sendFastTelemetry = (): void => {
  const elapsedSeconds = secondsSinceStart()
  const circleState = computeCircleState(elapsedSeconds)
  const timeSinceBootMs = Math.round(elapsedSeconds * MILLISECONDS_PER_SECOND)
  sendMavlinkMessage(buildGlobalPosition(circleState, timeSinceBootMs))
  sendMavlinkMessage(buildAttitude(circleState, timeSinceBootMs))
  sendMavlinkMessage(buildVfrHud(circleState))
}

const sendSlowTelemetry = (): void => {
  sendMavlinkMessage(buildSysStatus(secondsSinceStart()))
  sendMavlinkMessage(buildGpsRaw())
}

udpSocket.bind(() => {
  console.log(
    `fake vehicle -> udp ${targetUdpHost}:${targetUdpPort} @ ${telemetrySendRateHz} Hz, loss ${packetLossProbability}, jitter ${maxSendJitterMs} ms`
  )
  setInterval(() => sendMavlinkMessage(buildHeartbeat()), HEARTBEAT_INTERVAL_MS)
  setInterval(sendFastTelemetry, MILLISECONDS_PER_SECOND / telemetrySendRateHz)
  setInterval(sendSlowTelemetry, SLOW_TELEMETRY_INTERVAL_MS)
})
