import { useCallback } from 'react'

import type { LinkConfig } from '@shared/ipc'

import { useLinkStatus } from './useLinkStatus'
import { useLogLines } from './useLogLines'
import { useMergedTelemetry } from './useMergedTelemetry'

/** Call once, in App: every call opens its own IPC subscriptions. */
const useGcsBridge = () => {
  const { linkStatus, recordingStatus } = useLinkStatus()
  const { mergedTelemetry, ipcLatencyMs, reset: resetMergedTelemetry } = useMergedTelemetry()
  const logLines = useLogLines()

  const connect = useCallback(
    (linkConfig: LinkConfig) => {
      resetMergedTelemetry()
      return window.gcs.connect(linkConfig)
    },
    [resetMergedTelemetry]
  )

  return {
    linkStatus,
    recordingStatus,
    mergedTelemetry,
    ipcLatencyMs,
    logLines,
    connect,
    disconnect: window.gcs.disconnect,
    startRecording: window.gcs.startRecording,
    stopRecording: window.gcs.stopRecording,
    pickTlogFile: window.gcs.pickTlogFile,
  }
}

export { useGcsBridge }
