import type { TelemetryFrame } from '@shared/ipc'
import {
  CENTIAMPERES_PER_AMPERE,
  CENTIDEGREES_PER_DEGREE,
  CENTIMETERS_PER_METER,
  DEGREES_E7_PER_DEGREE,
  MILLIMETERS_PER_METER,
  MILLIVOLTS_PER_VOLT,
} from '@shared/units'
import {
  type MavLinkData,
  type MavLinkPacket,
  type MavLinkPacketRegistry,
  common,
  minimal,
} from 'node-mavlink'

const MAVLINK_MESSAGE_REGISTRY: MavLinkPacketRegistry = {
  ...minimal.REGISTRY,
  ...common.REGISTRY,
}

const HEADING_UNKNOWN_CENTIDEGREES = 65535
/** MAVLink reports an unavailable battery current or remaining percentage as -1. */
const BATTERY_VALUE_UNAVAILABLE = -1

type FrameSlices = Omit<TelemetryFrame, 'receivedAtEpochMs' | 'timeSinceBootMs' | 'systemId'>
type SliceConverter = (decodedMessage: MavLinkData) => FrameSlices & { timeSinceBootMs?: number }

const convertGlobalPosition = (decodedMessage: common.GlobalPositionInt) => ({
  timeSinceBootMs: decodedMessage.timeBootMs,
  position: {
    latitudeDegrees: decodedMessage.lat / DEGREES_E7_PER_DEGREE,
    longitudeDegrees: decodedMessage.lon / DEGREES_E7_PER_DEGREE,
    altitudeAboveSeaLevelMeters: decodedMessage.alt / MILLIMETERS_PER_METER,
    altitudeAboveHomeMeters: decodedMessage.relativeAlt / MILLIMETERS_PER_METER,
    velocityNorthMetersPerSecond: decodedMessage.vx / CENTIMETERS_PER_METER,
    velocityEastMetersPerSecond: decodedMessage.vy / CENTIMETERS_PER_METER,
    velocityDownMetersPerSecond: decodedMessage.vz / CENTIMETERS_PER_METER,
    headingDegrees:
      decodedMessage.hdg === HEADING_UNKNOWN_CENTIDEGREES
        ? null
        : decodedMessage.hdg / CENTIDEGREES_PER_DEGREE,
  },
})

const convertAttitude = (decodedMessage: common.Attitude) => ({
  timeSinceBootMs: decodedMessage.timeBootMs,
  attitude: {
    rollRadians: decodedMessage.roll,
    pitchRadians: decodedMessage.pitch,
    yawRadians: decodedMessage.yaw,
  },
})

const convertVfrHud = (decodedMessage: common.VfrHud) => ({
  vfrHud: {
    airspeedMetersPerSecond: decodedMessage.airspeed,
    groundSpeedMetersPerSecond: decodedMessage.groundspeed,
    headingDegrees: decodedMessage.heading,
    throttlePercent: decodedMessage.throttle,
    altitudeAboveSeaLevelMeters: decodedMessage.alt,
    climbRateMetersPerSecond: decodedMessage.climb,
  },
})

const convertSysStatus = (decodedMessage: common.SysStatus) => ({
  battery: {
    voltageVolts: decodedMessage.voltageBattery / MILLIVOLTS_PER_VOLT,
    currentAmperes:
      decodedMessage.currentBattery === BATTERY_VALUE_UNAVAILABLE
        ? null
        : decodedMessage.currentBattery / CENTIAMPERES_PER_AMPERE,
    remainingPercent:
      decodedMessage.batteryRemaining === BATTERY_VALUE_UNAVAILABLE
        ? null
        : decodedMessage.batteryRemaining,
  },
})

const convertGpsRaw = (decodedMessage: common.GpsRawInt) => ({
  gpsFix: { fixType: decodedMessage.fixType, satelliteCount: decodedMessage.satellitesVisible },
})

const convertHeartbeat = (decodedMessage: minimal.Heartbeat) => ({
  heartbeat: {
    vehicleType: decodedMessage.type,
    autopilotType: decodedMessage.autopilot,
    baseMode: decodedMessage.baseMode,
    customMode: decodedMessage.customMode,
    systemStatus: decodedMessage.systemStatus,
    isArmed: (decodedMessage.baseMode & minimal.MavModeFlag.SAFETY_ARMED) !== 0,
  },
})

const convertStatusText = (decodedMessage: common.StatusText) => ({
  statusText: { mavlinkSeverityCode: decodedMessage.severity, messageText: decodedMessage.text },
})

const convertHomePosition = (decodedMessage: common.HomePosition) => ({
  homePosition: {
    latitudeDegrees: decodedMessage.latitude / DEGREES_E7_PER_DEGREE,
    longitudeDegrees: decodedMessage.longitude / DEGREES_E7_PER_DEGREE,
    altitudeAboveSeaLevelMeters: decodedMessage.altitude / MILLIMETERS_PER_METER,
  },
})

/** One converter per MAVLink message id; a message without one is counted but produces no frame. */
const SLICE_CONVERTERS_BY_MESSAGE_ID: Record<number, SliceConverter> = {
  [common.GlobalPositionInt.MSG_ID]: convertGlobalPosition as SliceConverter,
  [common.Attitude.MSG_ID]: convertAttitude as SliceConverter,
  [common.VfrHud.MSG_ID]: convertVfrHud as SliceConverter,
  [common.SysStatus.MSG_ID]: convertSysStatus as SliceConverter,
  [common.GpsRawInt.MSG_ID]: convertGpsRaw as SliceConverter,
  [minimal.Heartbeat.MSG_ID]: convertHeartbeat as SliceConverter,
  [common.StatusText.MSG_ID]: convertStatusText as SliceConverter,
  [common.HomePosition.MSG_ID]: convertHomePosition as SliceConverter,
}

const messageNameOf = (packet: MavLinkPacket): string =>
  MAVLINK_MESSAGE_REGISTRY[packet.header.msgid]?.MSG_NAME ?? `msgid ${packet.header.msgid}`

/** MAVLink wire units: lat/lon 1e7 deg, alt mm, velocity cm/s, heading cdeg, voltage mV, current cA. */
const normalizePacketToTelemetryFrame = (
  packet: MavLinkPacket,
  receivedAtEpochMs = Date.now()
): TelemetryFrame | null => {
  const messageClass = MAVLINK_MESSAGE_REGISTRY[packet.header.msgid]
  const convertSlice = SLICE_CONVERTERS_BY_MESSAGE_ID[packet.header.msgid]
  if (!messageClass || !convertSlice) return null
  const { timeSinceBootMs, ...slices } = convertSlice(
    packet.protocol.data(packet.payload, messageClass)
  )
  return {
    receivedAtEpochMs,
    timeSinceBootMs: timeSinceBootMs ?? null,
    systemId: packet.header.sysid,
    ...slices,
  }
}

export {
  MAVLINK_MESSAGE_REGISTRY,
  HEADING_UNKNOWN_CENTIDEGREES,
  messageNameOf,
  normalizePacketToTelemetryFrame,
}
