import { MavLinkProtocolV2, minimal } from 'node-mavlink'
import type { MavLinkPacket } from 'node-mavlink'
import { describe, expect, it } from 'vitest'

import { countMissedPackets, createSequenceGapTracker } from '../src/main/link/sequenceGap'

const packetWith = (systemId: number, componentId: number, sequenceNumber: number): MavLinkPacket =>
  ({
    header: { sysid: systemId, compid: componentId, seq: sequenceNumber },
  }) as unknown as MavLinkPacket

describe('countMissedPackets', () => {
  it('returns 0 for consecutive sequence numbers', () => {
    expect(countMissedPackets(10, 11)).toBe(0)
  })

  it('counts the gap', () => {
    expect(countMissedPackets(10, 14)).toBe(3)
  })

  it('handles the wrap from 255 to 0', () => {
    expect(countMissedPackets(255, 0)).toBe(0)
    expect(countMissedPackets(254, 1)).toBe(2)
  })
})

describe('createSequenceGapTracker', () => {
  it('does not count interleaved streams as loss', () => {
    const tracker = createSequenceGapTracker()
    const vehicleStream = [0, 1, 2, 3].map((sequenceNumber) => packetWith(1, 1, sequenceNumber))
    const gcsStream = [100, 101].map((sequenceNumber) => packetWith(255, 190, sequenceNumber))
    const interleaved = [
      vehicleStream[0],
      gcsStream[0],
      vehicleStream[1],
      vehicleStream[2],
      gcsStream[1],
      vehicleStream[3],
    ]
    const totalMissed = interleaved.reduce((sum, packet) => sum + tracker.track(packet), 0)
    expect(totalMissed).toBe(0)
  })

  it('counts a gap inside one stream', () => {
    const tracker = createSequenceGapTracker()
    tracker.track(packetWith(1, 1, 5))
    expect(tracker.track(packetWith(1, 1, 8))).toBe(2)
  })

  it('serialises real packets with the expected header fields', () => {
    const protocol = new MavLinkProtocolV2(7, 1)
    const bytes = protocol.serialize(new minimal.Heartbeat(), 42)
    expect(bytes[4]).toBe(42)
    expect(bytes[5]).toBe(7)
  })
})
