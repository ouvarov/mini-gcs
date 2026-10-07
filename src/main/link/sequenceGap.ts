import type { MavLinkPacket } from 'node-mavlink'

/** seq is one byte and wraps 255 -> 0. */
const SEQUENCE_NUMBER_MODULO = 256

const countMissedPackets = (previousSequenceNumber: number, sequenceNumber: number): number => {
  const expectedSequenceNumber = (previousSequenceNumber + 1) % SEQUENCE_NUMBER_MODULO
  return (sequenceNumber - expectedSequenceNumber + SEQUENCE_NUMBER_MODULO) % SEQUENCE_NUMBER_MODULO
}

type SequenceGapTracker = {
  /** Returns how many packets went missing before this one on its own stream. */
  track: (packet: MavLinkPacket) => number
  reset: () => void
}

/** seq counters are independent per (system, component); mixing streams would read as constant loss. */
const createSequenceGapTracker = (): SequenceGapTracker => {
  let lastSequenceNumberByStream = new Map<string, number>()

  const track = (packet: MavLinkPacket): number => {
    const streamKey = `${packet.header.sysid}:${packet.header.compid}`
    const lastSequenceNumber = lastSequenceNumberByStream.get(streamKey)
    lastSequenceNumberByStream.set(streamKey, packet.header.seq)
    return lastSequenceNumber === undefined
      ? 0
      : countMissedPackets(lastSequenceNumber, packet.header.seq)
  }

  const reset = (): void => {
    lastSequenceNumberByStream = new Map()
  }

  return { track, reset }
}

export { SEQUENCE_NUMBER_MODULO, countMissedPackets, createSequenceGapTracker }
export type { SequenceGapTracker }
