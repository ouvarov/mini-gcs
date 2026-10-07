// Renderer never sees raw MAVLink; main normalises to TelemetryFrame first.

type UdpLinkConfig = {
  transport: 'udp'
  /** Local address to bind; the vehicle or MAVProxy sends to us. */
  bindAddress: string
  port: number
}

type TcpLinkConfig = {
  transport: 'tcp'
  hostAddress: string
  port: number
}

type TlogReplayLinkConfig = {
  transport: 'tlog'
  filePath: string
  /** 1 = recorded timing, 2 = twice as fast; null = no pauses at all. */
  playbackSpeedMultiplier: number | null
}

type LinkConfig = UdpLinkConfig | TcpLinkConfig | TlogReplayLinkConfig
type LinkTransport = LinkConfig['transport']

/** Where the link is in its lifecycle. */
type LinkState = 'idle' | 'connecting' | 'connected' | 'degraded' | 'lost'

type LinkStatus = {
  state: LinkState
  packetsPerSecond: number
  /** Gaps in MAVLink header sequence numbers since connect. */
  lostPacketCount: number
  crcErrorCount: number
  /** null before the first HEARTBEAT. */
  heartbeatAgeMs: number | null
  /** Packets per second in the last window, keyed by MAVLink message name. */
  packetsPerSecondByMessage: Record<string, number>
  /** Mean cost of split + parse + normalise per packet in the last window. */
  parseMicrosecondsPerPacket: number
  /** Reconnect attempt number while the transport is down, 0 otherwise. */
  reconnectAttempt: number
}

type RecordingStatus = {
  filePath: string | null
  bytesWritten: number
}

type GeodeticPoint = {
  latitudeDegrees: number
  longitudeDegrees: number
}

/** One MAVLink message = one frame = one slice, so the frame clock is that slice's clock. */
type TelemetryFrame = {
  /** Wall-clock ms in main at frame creation (replay: the recorded timestamp). */
  receivedAtEpochMs: number
  /** Autopilot clock (MAVLink time_boot_ms); null for messages that carry no timestamp. */
  timeSinceBootMs: number | null
  systemId: number
  position?: {
    latitudeDegrees: number
    longitudeDegrees: number
    altitudeAboveSeaLevelMeters: number
    altitudeAboveHomeMeters: number
    velocityNorthMetersPerSecond: number
    velocityEastMetersPerSecond: number
    velocityDownMetersPerSecond: number
    /** 0..360, null when the autopilot reports heading unknown. */
    headingDegrees: number | null
  }
  attitude?: {
    rollRadians: number
    pitchRadians: number
    yawRadians: number
  }
  vfrHud?: {
    airspeedMetersPerSecond: number
    groundSpeedMetersPerSecond: number
    headingDegrees: number
    throttlePercent: number
    altitudeAboveSeaLevelMeters: number
    climbRateMetersPerSecond: number
  }
  battery?: {
    voltageVolts: number
    currentAmperes: number | null
    remainingPercent: number | null
  }
  gpsFix?: {
    fixType: number
    satelliteCount: number
  }
  heartbeat?: {
    vehicleType: number
    autopilotType: number
    baseMode: number
    customMode: number
    systemStatus: number
    isArmed: boolean
  }
  statusText?: {
    /** MAV_SEVERITY 0 (emergency) .. 7 (debug). */
    mavlinkSeverityCode: number
    messageText: string
  }
  homePosition?: GeodeticPoint & {
    altitudeAboveSeaLevelMeters: number
  }
}

/** sentAtEpochMs is main's wall clock at send time; frame timestamps may be recorded ones during replay. */
type TelemetryBatch = {
  sentAtEpochMs: number
  frames: TelemetryFrame[]
}

type LogLine = {
  loggedAtEpochMs: number
  severityLevel: 'info' | 'warn' | 'error'
  messageText: string
}

const IPC_CHANNELS = {
  // main -> renderer
  telemetryBatch: 'telemetry:batch',
  linkStatus: 'link:status',
  recordingStatus: 'recording:status',
  logLine: 'log:line',
  // renderer -> main (invoke)
  linkConnect: 'link:connect',
  linkDisconnect: 'link:disconnect',
  recordingStart: 'recording:start',
  recordingStop: 'recording:stop',
  pickTlogFile: 'dialog:pick-tlog',
} as const

/** window.gcs, set up by the preload script. */
type GcsApi = {
  connect(linkConfig: LinkConfig): Promise<void>
  disconnect(): Promise<void>
  startRecording(): Promise<RecordingStatus>
  stopRecording(): Promise<RecordingStatus>
  pickTlogFile(): Promise<string | null>
  subscribeToTelemetryBatches(listener: (telemetryBatch: TelemetryBatch) => void): () => void
  subscribeToLinkStatus(listener: (linkStatus: LinkStatus) => void): () => void
  subscribeToRecordingStatus(listener: (recordingStatus: RecordingStatus) => void): () => void
  subscribeToLogLines(listener: (logLine: LogLine) => void): () => void
}

export { IPC_CHANNELS }
export type {
  UdpLinkConfig,
  TcpLinkConfig,
  TlogReplayLinkConfig,
  LinkConfig,
  LinkTransport,
  LinkState,
  LinkStatus,
  RecordingStatus,
  GeodeticPoint,
  TelemetryFrame,
  TelemetryBatch,
  LogLine,
  GcsApi,
}
