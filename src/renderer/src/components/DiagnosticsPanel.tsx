import type { LinkStatus } from '@shared/ipc'

import { formatNumber } from '../format'

type Props = {
  linkStatus: LinkStatus
  ipcLatencyMs: number
  trackSampleCount: number
  lastInnovationMeters: number
}

const PARSE_COST_DECIMALS = 1
const INNOVATION_DECIMALS = 2

const DiagnosticsPanel = ({
  linkStatus,
  ipcLatencyMs,
  trackSampleCount,
  lastInnovationMeters,
}: Props) => {
  const messageRatesDescending = Object.entries(linkStatus.packetsPerSecondByMessage).sort(
    ([, leftRate], [, rightRate]) => rightRate - leftRate
  )

  return (
    <div className="panel" data-testid="diagnostics">
      <div className="panel__title">Diagnostics</div>
      <dl className="panel__grid">
        <dt>Packets/s</dt>
        <dd>{linkStatus.packetsPerSecond}</dd>
        <dt>Lost (seq gaps)</dt>
        <dd>{linkStatus.lostPacketCount}</dd>
        <dt>CRC errors</dt>
        <dd>{linkStatus.crcErrorCount}</dd>
        <dt>Parse, µs/packet</dt>
        <dd>{formatNumber(linkStatus.parseMicrosecondsPerPacket, PARSE_COST_DECIMALS)}</dd>
        <dt>IPC latency, ms</dt>
        <dd>{ipcLatencyMs}</dd>
        <dt>Track samples</dt>
        <dd>{trackSampleCount}</dd>
        <dt>Filter innovation, m</dt>
        <dd>{formatNumber(lastInnovationMeters, INNOVATION_DECIMALS)}</dd>
      </dl>
      <div className="panel__title panel__title--secondary">Messages/s</div>
      <dl className="panel__grid panel__grid--compact">
        {messageRatesDescending.map(([messageName, packetsPerSecond]) => (
          <div key={messageName} className="panel__row">
            <dt>{messageName}</dt>
            <dd>{packetsPerSecond}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export { DiagnosticsPanel }
