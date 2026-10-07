import { useState } from 'react'

import {
  DEFAULT_UDP_LINK_CONFIG,
  EMPTY_VALUE_TEXT,
  LOCALHOST_ADDRESS,
  SITL_APP_TCP_PORT,
} from '@shared/defaults'
import type {
  LinkConfig,
  LinkStatus,
  LinkTransport,
  RecordingStatus,
  TlogReplayLinkConfig,
} from '@shared/ipc'

type LinkControls = {
  status: LinkStatus
  connect: (linkConfig: LinkConfig) => Promise<void>
  disconnect: () => Promise<void>
}

type RecordingControls = {
  status: RecordingStatus
  start: () => Promise<RecordingStatus>
  stop: () => Promise<RecordingStatus>
}

type Props = {
  initialLinkConfig: LinkConfig
  link: LinkControls
  recording: RecordingControls
  onPickTlogFile: () => Promise<string | null>
}

type AddressPortFieldsProps = {
  addressLabel: string
  address: string
  port: number
  disabled: boolean
  onChange: (address: string, port: number) => void
}

type TlogFieldsProps = {
  linkConfig: TlogReplayLinkConfig
  disabled: boolean
  onChange: (linkConfig: TlogReplayLinkConfig) => void
  onPickTlogFile: () => Promise<string | null>
}

type TransportFieldsProps = {
  linkConfig: LinkConfig
  disabled: boolean
  onChange: (linkConfig: LinkConfig) => void
  onPickTlogFile: () => Promise<string | null>
}

type TransportDefinition = {
  label: string
  defaultConfig: LinkConfig
}

// Exhaustive: a new LinkTransport without an entry here fails to compile.
const TRANSPORTS = {
  udp: { label: 'UDP listen', defaultConfig: DEFAULT_UDP_LINK_CONFIG },
  tcp: {
    label: 'TCP client',
    defaultConfig: { transport: 'tcp', hostAddress: LOCALHOST_ADDRESS, port: SITL_APP_TCP_PORT },
  },
  tlog: {
    label: 'Replay .tlog',
    defaultConfig: { transport: 'tlog', filePath: '', playbackSpeedMultiplier: 1 },
  },
} satisfies Record<LinkTransport, TransportDefinition>

const TRANSPORT_NAMES = Object.keys(TRANSPORTS) as LinkTransport[]

const PLAYBACK_SPEED_OPTIONS: { label: string; multiplier: number | null }[] = [
  { label: '1x', multiplier: 1 },
  { label: '2x', multiplier: 2 },
  { label: '5x', multiplier: 5 },
  { label: 'max', multiplier: null },
]
const MAX_SPEED_OPTION_VALUE = 'max'

const BYTES_PER_KILOBYTE = 1024

const formatHeartbeatAge = (heartbeatAgeMs: number | null): string =>
  heartbeatAgeMs === null ? EMPTY_VALUE_TEXT : `${heartbeatAgeMs} ms ago`

const playbackOptionValue = (multiplier: number | null): string =>
  multiplier === null ? MAX_SPEED_OPTION_VALUE : String(multiplier)

const AddressPortFields = ({
  addressLabel,
  address,
  port,
  disabled,
  onChange,
}: AddressPortFieldsProps) => (
  <>
    <input
      aria-label={addressLabel}
      value={address}
      disabled={disabled}
      onChange={(changeEvent) => onChange(changeEvent.target.value, port)}
    />
    <input
      aria-label="Port"
      type="number"
      value={port}
      disabled={disabled}
      onChange={(changeEvent) => onChange(address, Number(changeEvent.target.value))}
    />
  </>
)

const TlogFields = ({ linkConfig, disabled, onChange, onPickTlogFile }: TlogFieldsProps) => {
  const pickFile = async (): Promise<void> => {
    const filePath = await onPickTlogFile()
    if (filePath) onChange({ ...linkConfig, filePath })
  }

  return (
    <>
      <input
        aria-label="Telemetry log path"
        className="link__path"
        placeholder="/path/to/flight.tlog"
        value={linkConfig.filePath}
        disabled={disabled}
        onChange={(changeEvent) => onChange({ ...linkConfig, filePath: changeEvent.target.value })}
      />
      <button type="button" disabled={disabled} onClick={() => void pickFile()}>
        Browse
      </button>
      <select
        aria-label="Playback speed"
        value={playbackOptionValue(linkConfig.playbackSpeedMultiplier)}
        disabled={disabled}
        onChange={(changeEvent) =>
          onChange({
            ...linkConfig,
            playbackSpeedMultiplier:
              changeEvent.target.value === MAX_SPEED_OPTION_VALUE
                ? null
                : Number(changeEvent.target.value),
          })
        }
      >
        {PLAYBACK_SPEED_OPTIONS.map((option) => (
          <option key={option.label} value={playbackOptionValue(option.multiplier)}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  )
}

const TransportFields = ({
  linkConfig,
  disabled,
  onChange,
  onPickTlogFile,
}: TransportFieldsProps) => {
  switch (linkConfig.transport) {
    case 'udp':
      return (
        <AddressPortFields
          addressLabel="Bind address"
          address={linkConfig.bindAddress}
          port={linkConfig.port}
          disabled={disabled}
          onChange={(bindAddress, port) => onChange({ ...linkConfig, bindAddress, port })}
        />
      )
    case 'tcp':
      return (
        <AddressPortFields
          addressLabel="Host address"
          address={linkConfig.hostAddress}
          port={linkConfig.port}
          disabled={disabled}
          onChange={(hostAddress, port) => onChange({ ...linkConfig, hostAddress, port })}
        />
      )
    case 'tlog':
      return (
        <TlogFields
          linkConfig={linkConfig}
          disabled={disabled}
          onChange={onChange}
          onPickTlogFile={onPickTlogFile}
        />
      )
  }
}

const RecordButton = ({
  recording,
  disabled,
}: {
  recording: RecordingControls
  disabled: boolean
}) => {
  const isRecording = recording.status.filePath !== null
  const toggle = (): void => {
    void (isRecording ? recording.stop() : recording.start())
  }
  return (
    <button
      type="button"
      className={isRecording ? 'link__record link__record--active' : 'link__record'}
      disabled={disabled}
      onClick={toggle}
    >
      {isRecording
        ? `Stop · ${Math.round(recording.status.bytesWritten / BYTES_PER_KILOBYTE)} KB`
        : 'Record'}
    </button>
  )
}

const LinkStats = ({ status }: { status: LinkStatus }) => (
  <span className="link__stats">
    {status.packetsPerSecond} packets/s · lost {status.lostPacketCount} · crc {status.crcErrorCount}{' '}
    · heartbeat {formatHeartbeatAge(status.heartbeatAgeMs)}
  </span>
)

const LinkPanel = ({ initialLinkConfig, link, recording, onPickTlogFile }: Props) => {
  const [linkConfig, setLinkConfig] = useState<LinkConfig>(initialLinkConfig)
  const isLinkActive = link.status.state !== 'idle'

  const selectTransport = (transportName: string): void => {
    const transport = TRANSPORT_NAMES.find((candidate) => candidate === transportName)
    if (transport) setLinkConfig(TRANSPORTS[transport].defaultConfig)
  }

  return (
    <div className="link">
      <span className={`badge badge--${link.status.state}`} data-testid="link-state">
        {link.status.state}
        {link.status.reconnectAttempt > 0 && ` · retry ${link.status.reconnectAttempt}`}
      </span>
      <select
        aria-label="Transport"
        value={linkConfig.transport}
        disabled={isLinkActive}
        onChange={(changeEvent) => selectTransport(changeEvent.target.value)}
      >
        {TRANSPORT_NAMES.map((transport) => (
          <option key={transport} value={transport}>
            {TRANSPORTS[transport].label}
          </option>
        ))}
      </select>
      <TransportFields
        linkConfig={linkConfig}
        disabled={isLinkActive}
        onChange={setLinkConfig}
        onPickTlogFile={onPickTlogFile}
      />
      {isLinkActive ? (
        <button type="button" onClick={() => void link.disconnect()}>
          Disconnect
        </button>
      ) : (
        <button type="button" onClick={() => void link.connect(linkConfig)}>
          Connect
        </button>
      )}
      <RecordButton
        recording={recording}
        disabled={!isLinkActive || linkConfig.transport === 'tlog'}
      />
      <LinkStats status={link.status} />
    </div>
  )
}

export { LinkPanel }
export type { LinkControls, RecordingControls }
