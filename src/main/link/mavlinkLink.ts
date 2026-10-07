import { EventEmitter } from 'node:events'

import type {
  LinkConfig,
  LinkState,
  LinkStatus,
  LogLine,
  RecordingStatus,
  TelemetryFrame,
} from '@shared/ipc'
import {
  type MavLinkPacket,
  MavLinkPacketParser,
  MavLinkPacketSplitter,
  minimal,
} from 'node-mavlink'

import { type ByteSource, createByteSource } from './byteSources'
import { nextLinkState } from './linkHealth'
import { createLinkStatistics } from './linkStatistics'
import { normalizePacketToTelemetryFrame } from './normalize'
import { createReconnectScheduler } from './reconnectScheduler'
import { buildStreamRequestBytes } from './streamRequest'
import { createTlogRecorder } from './tlogRecorder'

type MavlinkLinkEvents = {
  frame: (frame: TelemetryFrame) => void
  status: (linkStatus: LinkStatus) => void
  recording: (recordingStatus: RecordingStatus) => void
  log: (logLine: LogLine) => void
}

type MavlinkLink = {
  connect: (linkConfig: LinkConfig) => Promise<void>
  disconnect: () => Promise<void>
  getLinkStatus: () => LinkStatus
  startRecording: (filePath: string) => RecordingStatus
  stopRecording: () => RecordingStatus
  subscribe: <EventName extends keyof MavlinkLinkEvents>(
    eventName: EventName,
    listener: MavlinkLinkEvents[EventName]
  ) => () => void
}

const STATUS_EMIT_INTERVAL_MS = 500
/** A heartbeat handled right now has age zero by definition. */
const FRESH_HEARTBEAT_AGE_MS = 0

const createMavlinkLink = (): MavlinkLink => {
  const linkEventEmitter = new EventEmitter()
  const statistics = createLinkStatistics()
  const recorder = createTlogRecorder()
  const reconnectScheduler = createReconnectScheduler()

  let activeLinkConfig: LinkConfig | null = null
  let activeByteSource: ByteSource | null = null
  let activePacketSplitter: MavLinkPacketSplitter | null = null
  let statusEmitIntervalHandle: NodeJS.Timeout | null = null

  let linkState: LinkState = 'idle'
  let isTransportDown = false
  /** Wall clock, never the frame timestamp: a replayed file would otherwise look hours stale. */
  let lastHeartbeatReceivedAtEpochMs: number | null = null
  /** Learned from the first non-GCS heartbeat; other systems (a routed MAVProxy heartbeat) are dropped. */
  let vehicleSystemId: number | null = null
  /** Set by the byte source per chunk and read by the packet handler the splitter calls synchronously. */
  let receivedAtEpochMsOfCurrentChunk = 0

  const emitLinkEvent = <EventName extends keyof MavlinkLinkEvents>(
    eventName: EventName,
    ...args: Parameters<MavlinkLinkEvents[EventName]>
  ): void => {
    linkEventEmitter.emit(eventName, ...args)
  }

  const emitLogLine = (severityLevel: LogLine['severityLevel'], messageText: string): void => {
    emitLinkEvent('log', { loggedAtEpochMs: Date.now(), severityLevel, messageText })
  }

  const heartbeatAgeMs = (nowEpochMs: number): number | null =>
    lastHeartbeatReceivedAtEpochMs === null ? null : nowEpochMs - lastHeartbeatReceivedAtEpochMs

  const getLinkStatus = (): LinkStatus => {
    const { packetLossRatioOfLastWindow: _lossRatioNotExposed, ...statisticsSnapshot } =
      statistics.snapshot()
    return {
      state: linkState,
      ...statisticsSnapshot,
      heartbeatAgeMs: heartbeatAgeMs(Date.now()),
      reconnectAttempt: reconnectScheduler.attempt(),
    }
  }

  const setLinkState = (nextState: LinkState): void => {
    if (linkState === nextState) return
    emitLogLine('info', `link ${linkState} -> ${nextState}`)
    linkState = nextState
    emitLinkEvent('status', getLinkStatus())
  }

  const applyLinkHealth = (ageMs: number | null): void => {
    setLinkState(
      nextLinkState({
        currentState: linkState,
        heartbeatAgeMs: ageMs,
        packetLossRatio: statistics.snapshot().packetLossRatioOfLastWindow,
        isTransportDown,
      })
    )
  }

  const learnVehicleSystemId = (frame: TelemetryFrame): void => {
    if (
      vehicleSystemId !== null ||
      !frame.heartbeat ||
      frame.heartbeat.vehicleType === minimal.MavType.GCS
    )
      return
    vehicleSystemId = frame.systemId
    emitLogLine('info', `vehicle is system ${vehicleSystemId}`)
  }

  const applyHeartbeat = (): void => {
    lastHeartbeatReceivedAtEpochMs = Date.now()
    isTransportDown = false
    reconnectScheduler.reset()
    applyLinkHealth(FRESH_HEARTBEAT_AGE_MS)
  }

  const handleIncomingPacket = (packet: MavLinkPacket): void => {
    const receivedAtEpochMs = receivedAtEpochMsOfCurrentChunk
    const parseStartedAtNanoseconds = statistics.recordPacketReceived(packet)
    recorder.write(packet.buffer, receivedAtEpochMs)

    const frame = normalizePacketToTelemetryFrame(packet, receivedAtEpochMs)
    statistics.recordParseEnd(parseStartedAtNanoseconds)
    if (!frame) return

    learnVehicleSystemId(frame)
    if (frame.systemId !== vehicleSystemId) return

    if (frame.heartbeat) applyHeartbeat()
    emitLinkEvent('frame', frame)
  }

  const openByteSource = async (linkConfig: LinkConfig): Promise<void> => {
    await activeByteSource?.stop()
    const byteSource = createByteSource(linkConfig)
    activeByteSource = byteSource
    isTransportDown = false

    const packetSplitter = activePacketSplitter
    if (!packetSplitter) return

    await byteSource.start({
      onBytes: (receivedBytes, receivedAtEpochMs) => {
        receivedAtEpochMsOfCurrentChunk = receivedAtEpochMs
        packetSplitter.write(receivedBytes)
      },
      onReady: (readyDescriptionText) => {
        emitLogLine('info', readyDescriptionText)
        byteSource.send?.(buildStreamRequestBytes())
      },
      onDown: (downReasonText) => {
        emitLogLine('warn', downReasonText)
        isTransportDown = true
      },
      onError: (errorMessageText) => emitLogLine('error', errorMessageText),
    })
  }

  const scheduleReconnectIfNeeded = (): void => {
    if (
      linkState !== 'lost' ||
      !isTransportDown ||
      !activeByteSource?.supportsReconnect ||
      !activeLinkConfig
    )
      return
    const linkConfigToRetry = activeLinkConfig
    const scheduled = reconnectScheduler.schedule(() => void openByteSource(linkConfigToRetry))
    if (scheduled)
      emitLogLine('warn', `reconnect attempt ${scheduled.attempt} in ${scheduled.delayMs} ms`)
  }

  const evaluateLinkHealthAndEmitStatus = (): void => {
    const nowEpochMs = Date.now()
    statistics.setCrcErrorCount(activePacketSplitter?.invalidPackages ?? 0)
    statistics.closeWindowIfElapsed(nowEpochMs)
    applyLinkHealth(heartbeatAgeMs(nowEpochMs))
    scheduleReconnectIfNeeded()
    emitLinkEvent('status', getLinkStatus())
  }

  const disconnect = async (): Promise<void> => {
    if (statusEmitIntervalHandle) clearInterval(statusEmitIntervalHandle)
    statusEmitIntervalHandle = null
    reconnectScheduler.reset()
    activeLinkConfig = null
    await activeByteSource?.stop()
    activeByteSource = null
    activePacketSplitter?.unpipe()
    activePacketSplitter = null
    isTransportDown = false
    if (linkState !== 'idle') setLinkState('idle')
  }

  const connect = async (linkConfig: LinkConfig): Promise<void> => {
    await disconnect()
    statistics.reset()
    lastHeartbeatReceivedAtEpochMs = null
    vehicleSystemId = null
    activeLinkConfig = linkConfig
    setLinkState('connecting')

    const packetSplitter = new MavLinkPacketSplitter()
    const packetParser = new MavLinkPacketParser()
    packetSplitter.pipe(packetParser)
    packetParser.on('data', handleIncomingPacket)
    activePacketSplitter = packetSplitter

    await openByteSource(linkConfig)
    statusEmitIntervalHandle = setInterval(evaluateLinkHealthAndEmitStatus, STATUS_EMIT_INTERVAL_MS)
  }

  const startRecording = (filePath: string): RecordingStatus => {
    const recordingStatus = recorder.start(filePath)
    emitLogLine('info', `recording to ${filePath}`)
    emitLinkEvent('recording', recordingStatus)
    return recordingStatus
  }

  const stopRecording = (): RecordingStatus => {
    const previousStatus = recorder.status()
    const recordingStatus = recorder.stop()
    if (previousStatus.filePath)
      emitLogLine(
        'info',
        `recording stopped, ${previousStatus.bytesWritten} bytes in ${previousStatus.filePath}`
      )
    emitLinkEvent('recording', recordingStatus)
    return recordingStatus
  }

  const subscribe: MavlinkLink['subscribe'] = (eventName, listener) => {
    linkEventEmitter.on(eventName, listener)
    return () => linkEventEmitter.off(eventName, listener)
  }

  return { connect, disconnect, getLinkStatus, startRecording, stopRecording, subscribe }
}

export { createMavlinkLink }
export type { MavlinkLink }
