import dgram from 'node:dgram'
import fsPromises from 'node:fs/promises'
import net from 'node:net'

import type { LinkConfig, TcpLinkConfig, TlogReplayLinkConfig, UdpLinkConfig } from '@shared/ipc'

import { type TlogRecord, decodeTlogRecords } from './tlog'

type ByteSourceHandlers = {
  onBytes: (receivedBytes: Buffer, receivedAtEpochMs: number) => void
  onReady: (readyDescriptionText: string) => void
  onDown: (downReasonText: string) => void
  onError: (errorMessageText: string) => void
}

/** What a transport must provide; the link never sees sockets or files. */
type ByteSource = {
  start: (handlers: ByteSourceHandlers) => Promise<void>
  stop: () => Promise<void>
  /** Absent for sources that cannot carry anything back (replay). */
  send?: (bytes: Buffer) => void
  /** True when losing the source is worth retrying (a server went away), false for a finished file. */
  supportsReconnect: boolean
}

const createUdpByteSource = (linkConfig: UdpLinkConfig): ByteSource => {
  let udpSocket: dgram.Socket | null = null
  let lastSenderEndpoint: dgram.RemoteInfo | null = null

  return {
    supportsReconnect: false,
    start: async (handlers) => {
      const socket = dgram.createSocket('udp4')
      socket.on('message', (receivedBytes, senderEndpoint) => {
        lastSenderEndpoint = senderEndpoint
        handlers.onBytes(receivedBytes, Date.now())
      })
      socket.on('error', (error) => handlers.onError(`udp: ${error.message}`))
      await new Promise<void>((resolve) =>
        socket.bind(linkConfig.port, linkConfig.bindAddress, resolve)
      )
      udpSocket = socket
      handlers.onReady(`udp listening on ${linkConfig.bindAddress}:${linkConfig.port}`)
    },
    stop: async () => {
      const socketToClose = udpSocket
      udpSocket = null
      if (socketToClose) await new Promise<void>((resolve) => socketToClose.close(() => resolve()))
    },
    // Replies go back to whoever talked to us last; UDP has no connection to answer on.
    send: (bytes) => {
      if (udpSocket && lastSenderEndpoint)
        udpSocket.send(bytes, lastSenderEndpoint.port, lastSenderEndpoint.address)
    },
  }
}

const createTcpByteSource = (linkConfig: TcpLinkConfig): ByteSource => {
  let tcpSocket: net.Socket | null = null

  return {
    supportsReconnect: true,
    // Resolves on connect and on error alike: a refused connection is reported through onError, then the
    // close event marks the transport down and the link schedules a reconnect.
    start: (handlers) =>
      new Promise<void>((resolve) => {
        const socket = net.createConnection({ host: linkConfig.hostAddress, port: linkConfig.port })
        socket.on('connect', () => {
          handlers.onReady(`tcp connected to ${linkConfig.hostAddress}:${linkConfig.port}`)
          resolve()
        })
        socket.on('data', (receivedBytes) => handlers.onBytes(receivedBytes, Date.now()))
        socket.on('error', (error) => {
          handlers.onError(`tcp: ${error.message}`)
          resolve()
        })
        socket.on('close', () => handlers.onDown('tcp closed'))
        tcpSocket = socket
      }),
    stop: async () => {
      tcpSocket?.removeAllListeners('close')
      tcpSocket?.destroy()
      tcpSocket = null
    },
    send: (bytes) => {
      tcpSocket?.write(bytes)
    },
  }
}

const createTlogReplayByteSource = (linkConfig: TlogReplayLinkConfig): ByteSource => {
  let isStopped = false
  let nextPlaybackTimerHandle: NodeJS.Timeout | null = null

  const schedulePlayback = (records: TlogRecord[], handlers: ByteSourceHandlers): void => {
    const replayStartedAtEpochMs = Date.now()
    const firstRecordReceivedAtEpochMs = records[0].receivedAtEpochMs
    let nextRecordIndex = 0

    const playDueRecords = (): void => {
      if (isStopped) return
      // Frames carry the recorded timestamp so downstream dt is the original flight's, not the replay's.
      while (nextRecordIndex < records.length) {
        const record = records[nextRecordIndex]
        const recordedOffsetMs = record.receivedAtEpochMs - firstRecordReceivedAtEpochMs
        const dueAtEpochMs =
          linkConfig.playbackSpeedMultiplier === null
            ? replayStartedAtEpochMs
            : replayStartedAtEpochMs + recordedOffsetMs / linkConfig.playbackSpeedMultiplier
        const waitMs = dueAtEpochMs - Date.now()
        if (waitMs > 0) {
          nextPlaybackTimerHandle = setTimeout(playDueRecords, waitMs)
          return
        }
        handlers.onBytes(record.packetBytes, record.receivedAtEpochMs)
        nextRecordIndex++
      }
      handlers.onDown('tlog finished')
    }
    playDueRecords()
  }

  return {
    supportsReconnect: false,
    start: async (handlers) => {
      const fileBytes = await fsPromises.readFile(linkConfig.filePath)
      const records = decodeTlogRecords(fileBytes)
      if (records.length === 0) {
        handlers.onError(`tlog: no records in ${linkConfig.filePath}`)
        handlers.onDown('tlog empty')
        return
      }
      const speedText =
        linkConfig.playbackSpeedMultiplier === null
          ? 'max'
          : `${linkConfig.playbackSpeedMultiplier}x`
      handlers.onReady(
        `tlog replay ${linkConfig.filePath}, ${records.length} packets, speed ${speedText}`
      )
      schedulePlayback(records, handlers)
    },
    stop: async () => {
      isStopped = true
      if (nextPlaybackTimerHandle) clearTimeout(nextPlaybackTimerHandle)
      nextPlaybackTimerHandle = null
    },
  }
}

const createByteSource = (linkConfig: LinkConfig): ByteSource => {
  switch (linkConfig.transport) {
    case 'udp':
      return createUdpByteSource(linkConfig)
    case 'tcp':
      return createTcpByteSource(linkConfig)
    case 'tlog':
      return createTlogReplayByteSource(linkConfig)
  }
}

export { createByteSource }
export type { ByteSource, ByteSourceHandlers }
