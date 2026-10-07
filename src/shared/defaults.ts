import type { RecordingStatus, UdpLinkConfig } from './ipc'

const LOCALHOST_ADDRESS = '127.0.0.1'
/** Same default as QGroundControl and MAVProxy `--out`. */
const DEFAULT_GCS_UDP_PORT = 14550
/** SITL's second and third MAVLink TCP ports; the first (5760) belongs to MAVProxy inside the container. */
const SITL_APP_TCP_PORT = 5762
const SITL_SCRIPT_TCP_PORT = 5763

const DEFAULT_UDP_LINK_CONFIG: UdpLinkConfig = {
  transport: 'udp',
  bindAddress: LOCALHOST_ADDRESS,
  port: DEFAULT_GCS_UDP_PORT,
}

const IDLE_RECORDING_STATUS: RecordingStatus = { filePath: null, bytesWritten: 0 }

/** Kyiv, Maidan: where the fake vehicle circles and where SITL takes off, so the map never jumps between sources. */
const DEMO_HOME_POINT = { latitudeDegrees: 50.4501, longitudeDegrees: 30.5234 }

/** ArduCopter custom_mode id for GUIDED (ardupilot/ArduCopter/mode.h). */
const ARDUCOPTER_GUIDED_MODE = 4

const EMPTY_VALUE_TEXT = '—'

export {
  LOCALHOST_ADDRESS,
  DEFAULT_GCS_UDP_PORT,
  SITL_APP_TCP_PORT,
  SITL_SCRIPT_TCP_PORT,
  DEFAULT_UDP_LINK_CONFIG,
  IDLE_RECORDING_STATUS,
  DEMO_HOME_POINT,
  ARDUCOPTER_GUIDED_MODE,
  EMPTY_VALUE_TEXT,
}
