import { useEffect, useState } from 'react'

import { IDLE_RECORDING_STATUS } from '@shared/defaults'
import type { LinkStatus, RecordingStatus } from '@shared/ipc'

const IDLE_LINK_STATUS: LinkStatus = {
  state: 'idle',
  packetsPerSecond: 0,
  lostPacketCount: 0,
  crcErrorCount: 0,
  heartbeatAgeMs: null,
  packetsPerSecondByMessage: {},
  parseMicrosecondsPerPacket: 0,
  reconnectAttempt: 0,
}

const useLinkStatus = () => {
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(IDLE_LINK_STATUS)
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>(IDLE_RECORDING_STATUS)

  useEffect(() => {
    const unsubscribeFromLinkStatus = window.gcs.subscribeToLinkStatus(setLinkStatus)
    const unsubscribeFromRecordingStatus = window.gcs.subscribeToRecordingStatus(setRecordingStatus)
    return () => {
      unsubscribeFromLinkStatus()
      unsubscribeFromRecordingStatus()
    }
  }, [])

  return { linkStatus, recordingStatus }
}

export { useLinkStatus }
