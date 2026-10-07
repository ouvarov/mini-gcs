import { useEffect, useRef } from 'react'

import type { TelemetryBatch } from '@shared/ipc'

/** Every frame, unmerged and unthrottled (useGcsBridge merges and throttles to rAF). */
const useTelemetryBatches = (onTelemetryBatch: (telemetryBatch: TelemetryBatch) => void): void => {
  const latestOnTelemetryBatchRef = useRef(onTelemetryBatch)

  useEffect(() => {
    latestOnTelemetryBatchRef.current = onTelemetryBatch
  }, [onTelemetryBatch])

  useEffect(
    () =>
      window.gcs.subscribeToTelemetryBatches((telemetryBatch) =>
        latestOnTelemetryBatchRef.current(telemetryBatch)
      ),
    []
  )
}

export { useTelemetryBatches }
