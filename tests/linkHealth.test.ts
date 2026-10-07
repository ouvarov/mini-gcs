import { describe, expect, it } from 'vitest'

import {
  DEGRADED_ENTER_LOSS_RATIO,
  DEGRADED_EXIT_LOSS_RATIO,
  HEARTBEAT_TIMEOUT_MS,
  nextLinkState,
} from '../src/main/link/linkHealth'

const LOSS_RATIO_MARGIN = 0.01
const healthy = { heartbeatAgeMs: 500, packetLossRatio: 0, isTransportDown: false }

describe('nextLinkState', () => {
  it('stays connecting until the first heartbeat', () => {
    expect(nextLinkState({ ...healthy, currentState: 'connecting', heartbeatAgeMs: null })).toBe(
      'connecting'
    )
    expect(nextLinkState({ ...healthy, currentState: 'connecting' })).toBe('connected')
  })

  it('goes lost when the heartbeat is older than the timeout', () => {
    expect(
      nextLinkState({
        ...healthy,
        currentState: 'connected',
        heartbeatAgeMs: HEARTBEAT_TIMEOUT_MS + 1,
      })
    ).toBe('lost')
  })

  it('recovers from lost on a fresh heartbeat', () => {
    expect(nextLinkState({ ...healthy, currentState: 'lost' })).toBe('connected')
  })

  it('goes lost when the transport reports down regardless of heartbeat age', () => {
    expect(nextLinkState({ ...healthy, currentState: 'connected', isTransportDown: true })).toBe(
      'lost'
    )
  })

  it('applies hysteresis between connected and degraded', () => {
    const betweenThresholds = (DEGRADED_ENTER_LOSS_RATIO + DEGRADED_EXIT_LOSS_RATIO) / 2
    expect(
      nextLinkState({ ...healthy, currentState: 'connected', packetLossRatio: betweenThresholds })
    ).toBe('connected')
    expect(
      nextLinkState({ ...healthy, currentState: 'degraded', packetLossRatio: betweenThresholds })
    ).toBe('degraded')
    expect(
      nextLinkState({
        ...healthy,
        currentState: 'connected',
        packetLossRatio: DEGRADED_ENTER_LOSS_RATIO + LOSS_RATIO_MARGIN,
      })
    ).toBe('degraded')
    expect(
      nextLinkState({
        ...healthy,
        currentState: 'degraded',
        packetLossRatio: DEGRADED_EXIT_LOSS_RATIO - LOSS_RATIO_MARGIN,
      })
    ).toBe('connected')
  })

  it('never leaves idle on its own', () => {
    expect(nextLinkState({ ...healthy, currentState: 'idle' })).toBe('idle')
  })
})
