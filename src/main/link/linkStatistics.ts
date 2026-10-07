import { MILLISECONDS_PER_SECOND } from '@shared/units'
import type { MavLinkPacket } from 'node-mavlink'

import { messageNameOf } from './normalize'
import { createSequenceGapTracker } from './sequenceGap'

type LinkStatisticsSnapshot = {
  packetsPerSecond: number
  packetsPerSecondByMessage: Record<string, number>
  parseMicrosecondsPerPacket: number
  lostPacketCount: number
  crcErrorCount: number
  /** Lost over (received + lost) inside the last closed window. */
  packetLossRatioOfLastWindow: number
}

type LinkStatistics = {
  /** Call before normalising; returns the time to pass into `recordParseEnd`. */
  recordPacketReceived: (packet: MavLinkPacket) => bigint
  recordParseEnd: (parseStartedAtNanoseconds: bigint) => void
  setCrcErrorCount: (crcErrorCount: number) => void
  /** Closes the window when it is old enough; call from the status timer. */
  closeWindowIfElapsed: (nowEpochMs: number) => void
  snapshot: () => LinkStatisticsSnapshot
  reset: () => void
}

const PACKET_RATE_WINDOW_MS = 1000
const NANOSECONDS_PER_MICROSECOND = 1000n

/** Per-window packet rates, loss ratio and parse cost. The window closes on the caller's clock, not on packet arrival. */
const createLinkStatistics = (): LinkStatistics => {
  const sequenceGapTracker = createSequenceGapTracker()
  let lostPacketCount = 0
  let crcErrorCount = 0
  let packetsReceivedInCurrentWindow = 0
  let packetsLostInCurrentWindow = 0
  let packetCountByMessageInCurrentWindow = new Map<string, number>()
  let parseNanosecondsInCurrentWindow = 0n
  let windowStartedAtEpochMs = Date.now()
  let lastClosedWindow: LinkStatisticsSnapshot = {
    packetsPerSecond: 0,
    packetsPerSecondByMessage: {},
    parseMicrosecondsPerPacket: 0,
    lostPacketCount: 0,
    crcErrorCount: 0,
    packetLossRatioOfLastWindow: 0,
  }

  const recordPacketReceived = (packet: MavLinkPacket): bigint => {
    packetsReceivedInCurrentWindow++
    const missedPacketCount = sequenceGapTracker.track(packet)
    lostPacketCount += missedPacketCount
    packetsLostInCurrentWindow += missedPacketCount
    const messageName = messageNameOf(packet)
    packetCountByMessageInCurrentWindow.set(
      messageName,
      (packetCountByMessageInCurrentWindow.get(messageName) ?? 0) + 1
    )
    return process.hrtime.bigint()
  }

  const recordParseEnd = (parseStartedAtNanoseconds: bigint): void => {
    parseNanosecondsInCurrentWindow += process.hrtime.bigint() - parseStartedAtNanoseconds
  }

  const setCrcErrorCount = (nextCrcErrorCount: number): void => {
    crcErrorCount = nextCrcErrorCount
  }

  const closeWindowIfElapsed = (nowEpochMs: number): void => {
    const elapsedWindowMs = nowEpochMs - windowStartedAtEpochMs
    if (elapsedWindowMs < PACKET_RATE_WINDOW_MS) return
    const windowToSecondScale = MILLISECONDS_PER_SECOND / elapsedWindowMs
    // Received and lost must come from the same window; cumulative lost over windowed received grows unbounded.
    const expectedPacketsInWindow = packetsReceivedInCurrentWindow + packetsLostInCurrentWindow
    lastClosedWindow = {
      packetsPerSecond: Math.round(packetsReceivedInCurrentWindow * windowToSecondScale),
      packetsPerSecondByMessage: Object.fromEntries(
        [...packetCountByMessageInCurrentWindow.entries()].map(([messageName, count]) => [
          messageName,
          Math.round(count * windowToSecondScale),
        ])
      ),
      parseMicrosecondsPerPacket:
        packetsReceivedInCurrentWindow > 0
          ? Number(parseNanosecondsInCurrentWindow / NANOSECONDS_PER_MICROSECOND) /
            packetsReceivedInCurrentWindow
          : 0,
      lostPacketCount,
      crcErrorCount,
      packetLossRatioOfLastWindow:
        expectedPacketsInWindow > 0 ? packetsLostInCurrentWindow / expectedPacketsInWindow : 0,
    }
    packetsReceivedInCurrentWindow = 0
    packetsLostInCurrentWindow = 0
    packetCountByMessageInCurrentWindow = new Map()
    parseNanosecondsInCurrentWindow = 0n
    windowStartedAtEpochMs = nowEpochMs
  }

  const snapshot = (): LinkStatisticsSnapshot => ({
    ...lastClosedWindow,
    lostPacketCount,
    crcErrorCount,
  })

  const reset = (): void => {
    sequenceGapTracker.reset()
    lostPacketCount = 0
    crcErrorCount = 0
    packetsReceivedInCurrentWindow = 0
    packetsLostInCurrentWindow = 0
    packetCountByMessageInCurrentWindow = new Map()
    parseNanosecondsInCurrentWindow = 0n
    windowStartedAtEpochMs = Date.now()
    lastClosedWindow = {
      ...lastClosedWindow,
      packetsPerSecond: 0,
      packetsPerSecondByMessage: {},
      parseMicrosecondsPerPacket: 0,
      packetLossRatioOfLastWindow: 0,
    }
  }

  return {
    recordPacketReceived,
    recordParseEnd,
    setCrcErrorCount,
    closeWindowIfElapsed,
    snapshot,
    reset,
  }
}

export { createLinkStatistics }
export type { LinkStatistics, LinkStatisticsSnapshot }
