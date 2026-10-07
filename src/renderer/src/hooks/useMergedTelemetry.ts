import { useCallback, useRef, useState } from 'react'

import type { TelemetryBatch } from '@shared/ipc'

import { type MergedTelemetry, mergeTelemetryFrame } from '../telemetry/mergedTelemetry'

import { useAnimationFrameFlush } from './useAnimationFrameFlush'
import { useTelemetryBatches } from './useTelemetryBatches'

/** Latest value of every message slice plus the IPC hop latency, flushed to React once per animation frame. */
const useMergedTelemetry = () => {
  const [mergedTelemetry, setMergedTelemetry] = useState<MergedTelemetry | null>(null)
  const [ipcLatencyMs, setIpcLatencyMs] = useState(0)
  const latestMergedTelemetryRef = useRef<MergedTelemetry | null>(null)
  const latestIpcLatencyMsRef = useRef(0)

  const requestFlush = useAnimationFrameFlush(
    useCallback(() => {
      setMergedTelemetry(latestMergedTelemetryRef.current)
      setIpcLatencyMs(latestIpcLatencyMsRef.current)
    }, [])
  )

  useTelemetryBatches(
    useCallback(
      (telemetryBatch: TelemetryBatch) => {
        for (const frame of telemetryBatch.frames) {
          latestMergedTelemetryRef.current = mergeTelemetryFrame(
            latestMergedTelemetryRef.current,
            frame
          )
        }
        latestIpcLatencyMsRef.current = Math.max(0, Date.now() - telemetryBatch.sentAtEpochMs)
        requestFlush()
      },
      [requestFlush]
    )
  )

  const reset = useCallback((): void => {
    latestMergedTelemetryRef.current = null
    setMergedTelemetry(null)
  }, [])

  return { mergedTelemetry, ipcLatencyMs, reset }
}

export { useMergedTelemetry }
