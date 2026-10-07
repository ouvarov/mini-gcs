import { MavLinkProtocolV2, common, minimal } from 'node-mavlink'
import { describe, expect, it } from 'vitest'

import { decodeTlogRecords, encodeTlogRecord } from '../src/main/link/tlog'

const FIRST_RECORD_EPOCH_MS = 1_700_000_000_000
const SECOND_RECORD_EPOCH_MS = FIRST_RECORD_EPOCH_MS + 250
const TRUNCATED_TAIL_BYTES = 3

const mavlinkProtocol = new MavLinkProtocolV2(1, 1)

describe('tlog', () => {
  it('round-trips records with their timestamps', () => {
    const heartbeatBytes = mavlinkProtocol.serialize(new minimal.Heartbeat(), 1)
    const positionBytes = mavlinkProtocol.serialize(new common.GlobalPositionInt(), 2)
    const tlogFileBytes = Buffer.concat([
      encodeTlogRecord(FIRST_RECORD_EPOCH_MS, heartbeatBytes),
      encodeTlogRecord(SECOND_RECORD_EPOCH_MS, positionBytes),
    ])

    const records = decodeTlogRecords(tlogFileBytes)

    expect(records.map((record) => record.receivedAtEpochMs)).toEqual([
      FIRST_RECORD_EPOCH_MS,
      SECOND_RECORD_EPOCH_MS,
    ])
    expect(records[0].packetBytes.equals(heartbeatBytes)).toBe(true)
    expect(records[1].packetBytes.equals(positionBytes)).toBe(true)
  })

  it('stops at a truncated trailing record instead of throwing', () => {
    const heartbeatBytes = mavlinkProtocol.serialize(new minimal.Heartbeat(), 1)
    const tlogFileBytes = encodeTlogRecord(FIRST_RECORD_EPOCH_MS, heartbeatBytes)
    const truncated = tlogFileBytes.subarray(0, tlogFileBytes.length - TRUNCATED_TAIL_BYTES)

    expect(decodeTlogRecords(truncated)).toHaveLength(0)
  })
})
