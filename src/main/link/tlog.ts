import { MICROSECONDS_PER_MILLISECOND } from '@shared/units'

/** MAVProxy / Mission Planner .tlog: each record is a big-endian uint64 epoch-microsecond timestamp followed by one raw MAVLink packet. */

const TIMESTAMP_BYTES = 8
const MAVLINK_V1_MAGIC = 0xfe
const MAVLINK_V2_MAGIC = 0xfd
const PAYLOAD_LENGTH_OFFSET = 1
const INCOMPATIBILITY_FLAGS_OFFSET = 2
const MAVLINK_V1_OVERHEAD_BYTES = 8
const MAVLINK_V2_OVERHEAD_BYTES = 12
const MAVLINK_V2_SIGNATURE_BYTES = 13
const MAVLINK_V2_SIGNED_FLAG = 0x01

type TlogRecord = {
  receivedAtEpochMs: number
  packetBytes: Buffer
}

const encodeTlogRecord = (receivedAtEpochMs: number, packetBytes: Buffer): Buffer => {
  const recordBytes = Buffer.alloc(TIMESTAMP_BYTES + packetBytes.length)
  recordBytes.writeBigUInt64BE(BigInt(receivedAtEpochMs) * BigInt(MICROSECONDS_PER_MILLISECOND))
  packetBytes.copy(recordBytes, TIMESTAMP_BYTES)
  return recordBytes
}

/** Packet length from the header alone, so records can be split without parsing the payload. */
const packetLengthAt = (fileBytes: Buffer, packetOffset: number): number | null => {
  const magic = fileBytes[packetOffset]
  const payloadLength = fileBytes[packetOffset + PAYLOAD_LENGTH_OFFSET]
  if (payloadLength === undefined) return null
  if (magic === MAVLINK_V1_MAGIC) return payloadLength + MAVLINK_V1_OVERHEAD_BYTES
  if (magic === MAVLINK_V2_MAGIC) {
    const incompatibilityFlags = fileBytes[packetOffset + INCOMPATIBILITY_FLAGS_OFFSET]
    const isSigned = (incompatibilityFlags & MAVLINK_V2_SIGNED_FLAG) !== 0
    return payloadLength + MAVLINK_V2_OVERHEAD_BYTES + (isSigned ? MAVLINK_V2_SIGNATURE_BYTES : 0)
  }
  return null
}

const decodeTlogRecords = (fileBytes: Buffer): TlogRecord[] => {
  const records: TlogRecord[] = []
  let recordOffset = 0
  while (recordOffset + TIMESTAMP_BYTES < fileBytes.length) {
    const receivedAtEpochMs = Number(
      fileBytes.readBigUInt64BE(recordOffset) / BigInt(MICROSECONDS_PER_MILLISECOND)
    )
    const packetOffset = recordOffset + TIMESTAMP_BYTES
    const packetLength = packetLengthAt(fileBytes, packetOffset)
    if (packetLength === null || packetOffset + packetLength > fileBytes.length) break
    records.push({
      receivedAtEpochMs,
      packetBytes: fileBytes.subarray(packetOffset, packetOffset + packetLength),
    })
    recordOffset = packetOffset + packetLength
  }
  return records
}

export { encodeTlogRecord, decodeTlogRecords }
export type { TlogRecord }
