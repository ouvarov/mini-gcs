import {
  type MavLinkData,
  type MavLinkPacket,
  MavLinkPacketParser,
  MavLinkPacketSplitter,
  MavLinkProtocolV2,
  common,
  minimal,
} from 'node-mavlink'
import { describe, expect, it } from 'vitest'

import {
  HEADING_UNKNOWN_CENTIDEGREES,
  normalizePacketToTelemetryFrame,
} from '../src/main/link/normalize'
import { ARDUCOPTER_GUIDED_MODE } from '../src/shared/defaults'

const VEHICLE_SYSTEM_ID = 1
const VEHICLE_COMPONENT_ID = 1
const SEQUENCE_NUMBER = 7
const RECEIVED_AT_EPOCH_MS = 42
const TIME_SINCE_BOOT_MS = 1234

/** Round-trip through the real protocol, splitter and parser: no mocks. */
const serializeAndParseBack = async (message: MavLinkData): Promise<MavLinkPacket> => {
  const mavlinkProtocol = new MavLinkProtocolV2(VEHICLE_SYSTEM_ID, VEHICLE_COMPONENT_ID)
  const serializedPacket = mavlinkProtocol.serialize(message, SEQUENCE_NUMBER)
  const packetSplitter = new MavLinkPacketSplitter()
  const packetParser = new MavLinkPacketParser()
  packetSplitter.pipe(packetParser)
  const packetPromise = new Promise<MavLinkPacket>((resolve) => packetParser.once('data', resolve))
  packetSplitter.write(serializedPacket)
  return packetPromise
}

describe('normalizePacketToTelemetryFrame', () => {
  it('converts GLOBAL_POSITION_INT wire units to SI', async () => {
    const globalPositionMessage = new common.GlobalPositionInt()
    globalPositionMessage.timeBootMs = TIME_SINCE_BOOT_MS
    globalPositionMessage.lat = 504501000
    globalPositionMessage.lon = 305234000
    globalPositionMessage.alt = 300_000
    globalPositionMessage.relativeAlt = 120_000
    globalPositionMessage.vx = 1500
    globalPositionMessage.vy = -250
    globalPositionMessage.vz = 10
    globalPositionMessage.hdg = 9000

    const telemetryFrame = normalizePacketToTelemetryFrame(
      await serializeAndParseBack(globalPositionMessage),
      RECEIVED_AT_EPOCH_MS
    )
    expect(telemetryFrame).not.toBeNull()
    expect(telemetryFrame!.receivedAtEpochMs).toBe(RECEIVED_AT_EPOCH_MS)
    expect(telemetryFrame!.timeSinceBootMs).toBe(TIME_SINCE_BOOT_MS)
    expect(telemetryFrame!.position).toEqual({
      latitudeDegrees: 50.4501,
      longitudeDegrees: 30.5234,
      altitudeAboveSeaLevelMeters: 300,
      altitudeAboveHomeMeters: 120,
      velocityNorthMetersPerSecond: 15,
      velocityEastMetersPerSecond: -2.5,
      velocityDownMetersPerSecond: 0.1,
      headingDegrees: 90,
    })
  })

  it('reports unknown heading as null', async () => {
    const globalPositionMessage = new common.GlobalPositionInt()
    globalPositionMessage.hdg = HEADING_UNKNOWN_CENTIDEGREES
    const telemetryFrame = normalizePacketToTelemetryFrame(
      await serializeAndParseBack(globalPositionMessage)
    )
    expect(telemetryFrame!.position!.headingDegrees).toBeNull()
  })

  it('leaves boot time null for messages without a timestamp', async () => {
    const telemetryFrame = normalizePacketToTelemetryFrame(
      await serializeAndParseBack(new common.VfrHud())
    )
    expect(telemetryFrame!.timeSinceBootMs).toBeNull()
    expect(telemetryFrame!.vfrHud).toBeDefined()
  })

  it('derives isArmed from HEARTBEAT base_mode', async () => {
    const heartbeatMessage = new minimal.Heartbeat()
    heartbeatMessage.baseMode =
      minimal.MavModeFlag.SAFETY_ARMED | minimal.MavModeFlag.GUIDED_ENABLED
    heartbeatMessage.customMode = ARDUCOPTER_GUIDED_MODE
    const telemetryFrame = normalizePacketToTelemetryFrame(
      await serializeAndParseBack(heartbeatMessage)
    )
    expect(telemetryFrame!.heartbeat).toMatchObject({
      isArmed: true,
      customMode: ARDUCOPTER_GUIDED_MODE,
    })
  })

  it('returns null for a message it does not convert', async () => {
    expect(
      normalizePacketToTelemetryFrame(await serializeAndParseBack(new common.ParamValue()))
    ).toBeNull()
  })
})
