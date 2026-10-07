import type { LinkState } from '@shared/ipc'

type LinkHealthInput = {
  currentState: LinkState
  heartbeatAgeMs: number | null
  packetLossRatio: number
  /** Set when the underlying transport reported it is gone (tcp close, replay ended). */
  isTransportDown: boolean
}

const HEARTBEAT_TIMEOUT_MS = 3000
// Hysteresis: a link flapping around one threshold would blink the badge every window.
const DEGRADED_ENTER_LOSS_RATIO = 0.08
const DEGRADED_EXIT_LOSS_RATIO = 0.03

/** Pure state decision; counters, sockets and timers live in createMavlinkLink. */
const nextLinkState = ({
  currentState,
  heartbeatAgeMs,
  packetLossRatio,
  isTransportDown,
}: LinkHealthInput): LinkState => {
  if (currentState === 'idle') return 'idle'
  if (isTransportDown) return 'lost'
  if (heartbeatAgeMs !== null && heartbeatAgeMs > HEARTBEAT_TIMEOUT_MS) return 'lost'
  if (currentState === 'connecting' || currentState === 'lost')
    return heartbeatAgeMs === null ? currentState : 'connected'
  if (currentState === 'connected')
    return packetLossRatio > DEGRADED_ENTER_LOSS_RATIO ? 'degraded' : 'connected'
  if (currentState === 'degraded')
    return packetLossRatio < DEGRADED_EXIT_LOSS_RATIO ? 'connected' : 'degraded'
  return currentState
}

export { nextLinkState, HEARTBEAT_TIMEOUT_MS, DEGRADED_ENTER_LOSS_RATIO, DEGRADED_EXIT_LOSS_RATIO }
export type { LinkHealthInput }
