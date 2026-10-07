import { MavLinkProtocolV2, common } from 'node-mavlink'

/** Our own MAVLink identity: 255 is the conventional GCS system id. */
const GCS_SYSTEM_ID = 255
const GCS_COMPONENT_ID = 190
/** Addressed before the first heartbeat, so the vehicle id is not known yet; 1 is the ArduPilot default. */
const ASSUMED_VEHICLE_SYSTEM_ID = 1
const ASSUMED_VEHICLE_COMPONENT_ID = 1
const REQUEST_DATA_STREAM_START = 1
const STREAM_REQUEST_RATE_HZ = 10

/** SITL and most autopilots send heartbeats only until a GCS asks for streams. */
const buildStreamRequestBytes = (rateHz = STREAM_REQUEST_RATE_HZ): Buffer => {
  const requestDataStream = new common.RequestDataStream()
  requestDataStream.targetSystem = ASSUMED_VEHICLE_SYSTEM_ID
  requestDataStream.targetComponent = ASSUMED_VEHICLE_COMPONENT_ID
  requestDataStream.reqStreamId = common.MavDataStream.ALL
  requestDataStream.reqMessageRate = rateHz
  requestDataStream.startStop = REQUEST_DATA_STREAM_START
  return new MavLinkProtocolV2(GCS_SYSTEM_ID, GCS_COMPONENT_ID).serialize(requestDataStream, 0)
}

export { buildStreamRequestBytes, STREAM_REQUEST_RATE_HZ }
