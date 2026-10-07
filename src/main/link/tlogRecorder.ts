import fs from 'node:fs'

import { IDLE_RECORDING_STATUS } from '@shared/defaults'
import type { RecordingStatus } from '@shared/ipc'

import { encodeTlogRecord } from './tlog'

type TlogRecorder = {
  start: (filePath: string) => RecordingStatus
  stop: () => RecordingStatus
  write: (packetBytes: Buffer, receivedAtEpochMs: number) => void
  status: () => RecordingStatus
}

const createTlogRecorder = (): TlogRecorder => {
  let writeStream: fs.WriteStream | null = null
  let recordingStatus: RecordingStatus = IDLE_RECORDING_STATUS

  const start = (filePath: string): RecordingStatus => {
    writeStream?.end()
    writeStream = fs.createWriteStream(filePath)
    recordingStatus = { filePath, bytesWritten: 0 }
    return recordingStatus
  }

  const stop = (): RecordingStatus => {
    writeStream?.end()
    writeStream = null
    recordingStatus = IDLE_RECORDING_STATUS
    return recordingStatus
  }

  const write = (packetBytes: Buffer, receivedAtEpochMs: number): void => {
    if (!writeStream) return
    const tlogRecordBytes = encodeTlogRecord(receivedAtEpochMs, packetBytes)
    writeStream.write(tlogRecordBytes)
    recordingStatus = {
      ...recordingStatus,
      bytesWritten: recordingStatus.bytesWritten + tlogRecordBytes.length,
    }
  }

  return { start, stop, write, status: () => recordingStatus }
}

export { createTlogRecorder }
export type { TlogRecorder }
