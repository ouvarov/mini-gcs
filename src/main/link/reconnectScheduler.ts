type ReconnectScheduler = {
  /** Schedules the next attempt unless one is already pending; returns the attempt number or null. */
  schedule: (attemptReconnect: () => void) => { attempt: number; delayMs: number } | null
  cancel: () => void
  /** Attempt counter, 0 when nothing is pending or the link recovered. */
  attempt: () => number
  reset: () => void
}

const RECONNECT_INITIAL_DELAY_MS = 1000
const RECONNECT_BACKOFF_FACTOR = 2
const RECONNECT_MAX_DELAY_MS = 30_000

const createReconnectScheduler = (): ReconnectScheduler => {
  let reconnectAttempt = 0
  let timerHandle: NodeJS.Timeout | null = null

  const schedule: ReconnectScheduler['schedule'] = (attemptReconnect) => {
    if (timerHandle) return null
    reconnectAttempt++
    const delayMs = Math.min(
      RECONNECT_INITIAL_DELAY_MS * RECONNECT_BACKOFF_FACTOR ** (reconnectAttempt - 1),
      RECONNECT_MAX_DELAY_MS
    )
    timerHandle = setTimeout(() => {
      timerHandle = null
      attemptReconnect()
    }, delayMs)
    return { attempt: reconnectAttempt, delayMs }
  }

  const cancel = (): void => {
    if (timerHandle) clearTimeout(timerHandle)
    timerHandle = null
  }

  const reset = (): void => {
    cancel()
    reconnectAttempt = 0
  }

  return { schedule, cancel, attempt: () => reconnectAttempt, reset }
}

export { createReconnectScheduler }
export type { ReconnectScheduler }
