import { describe, expect, it } from 'vitest'

import {
  mergeTelemetryFrame,
  selectHeadingDegrees,
} from '../src/renderer/src/telemetry/mergedTelemetry'
import type { TelemetryFrame } from '../src/shared/ipc'

const SYSTEM_ID = 1
const BOOT_OFFSET_MS = 1000
const ARBITRARY_EPOCH_MS = 1
const POSITION_HEADING_DEGREES = 90
const VFR_HUD_HEADING_DEGREES = 180

const buildPositionFrame = (
  receivedAtEpochMs: number,
  headingDegrees: number | null
): TelemetryFrame => ({
  receivedAtEpochMs,
  timeSinceBootMs: receivedAtEpochMs - BOOT_OFFSET_MS,
  systemId: SYSTEM_ID,
  position: {
    latitudeDegrees: 50.45,
    longitudeDegrees: 30.52,
    altitudeAboveSeaLevelMeters: 300,
    altitudeAboveHomeMeters: 120,
    velocityNorthMetersPerSecond: 1,
    velocityEastMetersPerSecond: 0,
    velocityDownMetersPerSecond: 0,
    headingDegrees,
  },
})

const buildAttitudeFrame = (receivedAtEpochMs: number): TelemetryFrame => ({
  receivedAtEpochMs,
  timeSinceBootMs: receivedAtEpochMs - BOOT_OFFSET_MS,
  systemId: SYSTEM_ID,
  attitude: { rollRadians: 0.1, pitchRadians: 0, yawRadians: 1 },
})

const buildVfrHudFrame = (receivedAtEpochMs: number, headingDegrees: number): TelemetryFrame => ({
  receivedAtEpochMs,
  timeSinceBootMs: null,
  systemId: SYSTEM_ID,
  vfrHud: {
    airspeedMetersPerSecond: 15,
    groundSpeedMetersPerSecond: 15,
    headingDegrees,
    throttlePercent: 50,
    altitudeAboveSeaLevelMeters: 300,
    climbRateMetersPerSecond: 0,
  },
})

describe('mergeTelemetryFrame', () => {
  it('keeps the position timestamp when a later attitude frame arrives', () => {
    const positionReceivedAtEpochMs = 1000
    const attitudeReceivedAtEpochMs = 1040

    const afterPosition = mergeTelemetryFrame(
      null,
      buildPositionFrame(positionReceivedAtEpochMs, POSITION_HEADING_DEGREES)
    )
    const afterAttitude = mergeTelemetryFrame(
      afterPosition,
      buildAttitudeFrame(attitudeReceivedAtEpochMs)
    )

    expect(afterAttitude.position?.receivedAtEpochMs).toBe(positionReceivedAtEpochMs)
    expect(afterAttitude.position?.timeSinceBootMs).toBe(positionReceivedAtEpochMs - BOOT_OFFSET_MS)
    expect(afterAttitude.attitude?.receivedAtEpochMs).toBe(attitudeReceivedAtEpochMs)
  })

  it('stores null boot time for messages without a timestamp', () => {
    const mergedAfterVfrHud = mergeTelemetryFrame(
      null,
      buildVfrHudFrame(ARBITRARY_EPOCH_MS, VFR_HUD_HEADING_DEGREES)
    )
    expect(mergedAfterVfrHud.vfrHud?.timeSinceBootMs).toBeNull()
  })

  it('does not mutate the previous snapshot', () => {
    const snapshotBeforeSecondFrame = mergeTelemetryFrame(
      null,
      buildPositionFrame(1000, POSITION_HEADING_DEGREES)
    )
    mergeTelemetryFrame(snapshotBeforeSecondFrame, buildPositionFrame(1100, 95))
    expect(snapshotBeforeSecondFrame.position?.headingDegrees).toBe(POSITION_HEADING_DEGREES)
  })
})

describe('selectHeadingDegrees', () => {
  const withVfrHudHeading = mergeTelemetryFrame(
    null,
    buildVfrHudFrame(ARBITRARY_EPOCH_MS, VFR_HUD_HEADING_DEGREES)
  )

  it('prefers the position heading', () => {
    const withBothHeadings = mergeTelemetryFrame(
      withVfrHudHeading,
      buildPositionFrame(ARBITRARY_EPOCH_MS, POSITION_HEADING_DEGREES)
    )
    expect(selectHeadingDegrees(withBothHeadings)).toBe(POSITION_HEADING_DEGREES)
  })

  it('falls back to VFR_HUD when the autopilot reports heading unknown', () => {
    const withUnknownPositionHeading = mergeTelemetryFrame(
      withVfrHudHeading,
      buildPositionFrame(ARBITRARY_EPOCH_MS, null)
    )
    expect(selectHeadingDegrees(withUnknownPositionHeading)).toBe(VFR_HUD_HEADING_DEGREES)
  })

  it('returns null when neither source has a heading', () => {
    expect(
      selectHeadingDegrees(mergeTelemetryFrame(null, buildAttitudeFrame(ARBITRARY_EPOCH_MS)))
    ).toBeNull()
    expect(selectHeadingDegrees(null)).toBeNull()
  })
})
