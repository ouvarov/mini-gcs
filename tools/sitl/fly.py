"""Arm, take off, fly a looping square mission. Runs in the SITL container:
  docker exec -i mini-gcs-sitl python3 - < tools/sitl/fly.py
Port 5763 is SITL's third MAVLink port; MAVProxy holds 5760, the app may hold 5762.
"""
import math
import sys
import time
from dataclasses import dataclass

from pymavlink import mavutil

SITL_SCRIPT_TCP_PORT = 5763
DEFAULT_CONNECTION_URL = f"tcp:127.0.0.1:{SITL_SCRIPT_TCP_PORT}"

TAKEOFF_ALTITUDE_ABOVE_HOME_METERS = 50
ALTITUDE_REACHED_RATIO = 0.95
MISSION_ALTITUDE_ABOVE_HOME_METERS = 60
MISSION_HALF_SIDE_METERS = 300
MISSION_LOOP_FOREVER = -1
TELEMETRY_STREAM_RATE_HZ = 4
REQUEST_DATA_STREAM_START = 1
GPS_FIX_TYPE_3D = 3
GPS_FIX_TIMEOUT_SECONDS = 90
MISSION_UPLOAD_TIMEOUT_SECONDS = 30
MODE_CHANGE_TIMEOUT_SECONDS = 15
ARMING_TIMEOUT_SECONDS = 90
TAKEOFF_TIMEOUT_SECONDS = 90
POLL_INTERVAL_SECONDS = 0.5
RECEIVE_TIMEOUT_SECONDS = 2
ARM_ATTEMPT_SECONDS = 3
MILLIMETERS_PER_METER = 1000
DEGREES_TO_E7 = 1e7
METERS_PER_DEGREE_LATITUDE = 111_320
# MAV_CMD_NAV_TAKEOFF uses param1..param6 for pitch/yaw/lat/lon that a copter ignores; param7 is altitude.
TAKEOFF_UNUSED_PARAMS = (0, 0, 0, 0, 0, 0)
NO_MISSION_PARAMS = (0, 0, 0, 0)
MISSION_ITEM_IS_CURRENT = 0
MISSION_ITEM_AUTOCONTINUE = 1


@dataclass(frozen=True)
class MissionItem:
    command: int
    frame: int
    latitude_degrees: float
    longitude_degrees: float
    altitude_meters: float
    params: tuple = NO_MISSION_PARAMS


def log(message_text: str) -> None:
    print(f"[fly] {message_text}", flush=True)


def fail(message_text: str) -> None:
    raise SystemExit(f"[fly] {message_text}")


def wait_until(condition_is_met, description: str, timeout_seconds: float) -> None:
    deadline_monotonic_seconds = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline_monotonic_seconds:
        if condition_is_met():
            return
        time.sleep(POLL_INTERVAL_SECONDS)
    fail(f"timeout waiting for {description}")


def read_global_position(mavlink_connection):
    return mavlink_connection.recv_match(type="GLOBAL_POSITION_INT", blocking=True, timeout=RECEIVE_TIMEOUT_SECONDS)


def read_altitude_above_home_meters(mavlink_connection) -> float:
    global_position_message = read_global_position(mavlink_connection)
    return global_position_message.relative_alt / MILLIMETERS_PER_METER if global_position_message else 0.0


def read_current_mode_name(mavlink_connection) -> str:
    mavlink_connection.recv_match(type="HEARTBEAT", blocking=True, timeout=RECEIVE_TIMEOUT_SECONDS)
    return mavlink_connection.flightmode


def read_has_gps_3d_fix(mavlink_connection) -> bool:
    gps_message = mavlink_connection.recv_match(type="GPS_RAW_INT", blocking=True, timeout=RECEIVE_TIMEOUT_SECONDS)
    return gps_message is not None and gps_message.fix_type >= GPS_FIX_TYPE_3D


def read_is_armed(mavlink_connection) -> bool:
    mavlink_connection.recv_match(type="HEARTBEAT", blocking=True, timeout=RECEIVE_TIMEOUT_SECONDS)
    return mavlink_connection.motors_armed()


def set_mode(mavlink_connection, mode_name: str) -> None:
    mavlink_connection.set_mode(mavlink_connection.mode_mapping()[mode_name])
    wait_until(lambda: read_current_mode_name(mavlink_connection) == mode_name, f"mode {mode_name}", MODE_CHANGE_TIMEOUT_SECONDS)
    log(f"mode {mode_name}")


def try_arm_once(mavlink_connection) -> bool:
    mavlink_connection.arducopter_arm()
    attempt_deadline_monotonic_seconds = time.monotonic() + ARM_ATTEMPT_SECONDS
    while time.monotonic() < attempt_deadline_monotonic_seconds:
        if read_is_armed(mavlink_connection):
            return True
    return False


def arm_with_retries(mavlink_connection) -> None:
    # Pre-arm checks keep refusing until EKF has a position estimate, which lands seconds after GPS fix.
    deadline_monotonic_seconds = time.monotonic() + ARMING_TIMEOUT_SECONDS
    while time.monotonic() < deadline_monotonic_seconds:
        if try_arm_once(mavlink_connection):
            return
        log("arm refused, retrying")
    fail("timeout waiting for arming")


def offset_latitude_longitude(latitude_degrees: float, longitude_degrees: float,
                              north_meters: float, east_meters: float) -> tuple:
    meters_per_degree_longitude = METERS_PER_DEGREE_LATITUDE * math.cos(math.radians(latitude_degrees))
    return (latitude_degrees + north_meters / METERS_PER_DEGREE_LATITUDE,
            longitude_degrees + east_meters / meters_per_degree_longitude)


def build_square_mission(center_latitude_degrees: float, center_longitude_degrees: float) -> list:
    """Item 0 is the home placeholder ArduPilot expects; 1..4 corners; 5 jumps back to 1 forever."""
    corners_north_east_meters = [
        (MISSION_HALF_SIDE_METERS, MISSION_HALF_SIDE_METERS),
        (MISSION_HALF_SIDE_METERS, -MISSION_HALF_SIDE_METERS),
        (-MISSION_HALF_SIDE_METERS, -MISSION_HALF_SIDE_METERS),
        (-MISSION_HALF_SIDE_METERS, MISSION_HALF_SIDE_METERS),
    ]
    mission_items = [MissionItem(
        command=mavutil.mavlink.MAV_CMD_NAV_WAYPOINT,
        frame=mavutil.mavlink.MAV_FRAME_GLOBAL,
        latitude_degrees=center_latitude_degrees, longitude_degrees=center_longitude_degrees, altitude_meters=0,
    )]
    for north_meters, east_meters in corners_north_east_meters:
        latitude_degrees, longitude_degrees = offset_latitude_longitude(
            center_latitude_degrees, center_longitude_degrees, north_meters, east_meters)
        mission_items.append(MissionItem(
            command=mavutil.mavlink.MAV_CMD_NAV_WAYPOINT,
            frame=mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT,
            latitude_degrees=latitude_degrees, longitude_degrees=longitude_degrees,
            altitude_meters=MISSION_ALTITUDE_ABOVE_HOME_METERS,
        ))
    first_corner_sequence = 1
    mission_items.append(MissionItem(
        command=mavutil.mavlink.MAV_CMD_DO_JUMP,
        frame=mavutil.mavlink.MAV_FRAME_MISSION,
        latitude_degrees=0, longitude_degrees=0, altitude_meters=0,
        params=(first_corner_sequence, MISSION_LOOP_FOREVER, 0, 0),
    ))
    return mission_items


def send_mission_item(mavlink_connection, sequence: int, mission_item: MissionItem) -> None:
    mavlink_connection.mav.mission_item_int_send(
        mavlink_connection.target_system, mavlink_connection.target_component,
        sequence, mission_item.frame, mission_item.command,
        MISSION_ITEM_IS_CURRENT, MISSION_ITEM_AUTOCONTINUE,
        *mission_item.params,
        int(mission_item.latitude_degrees * DEGREES_TO_E7), int(mission_item.longitude_degrees * DEGREES_TO_E7),
        mission_item.altitude_meters, mavutil.mavlink.MAV_MISSION_TYPE_MISSION,
    )


def upload_mission(mavlink_connection, mission_items: list) -> None:
    mavlink_connection.mav.mission_count_send(
        mavlink_connection.target_system, mavlink_connection.target_component,
        len(mission_items), mavutil.mavlink.MAV_MISSION_TYPE_MISSION,
    )
    sent_item_count = 0
    deadline_monotonic_seconds = time.monotonic() + MISSION_UPLOAD_TIMEOUT_SECONDS
    while sent_item_count < len(mission_items) and time.monotonic() < deadline_monotonic_seconds:
        mission_request = mavlink_connection.recv_match(
            type=["MISSION_REQUEST", "MISSION_REQUEST_INT"], blocking=True, timeout=RECEIVE_TIMEOUT_SECONDS)
        if mission_request is None:
            continue
        send_mission_item(mavlink_connection, mission_request.seq, mission_items[mission_request.seq])
        sent_item_count = max(sent_item_count, mission_request.seq + 1)
    mission_ack = mavlink_connection.recv_match(type="MISSION_ACK", blocking=True, timeout=RECEIVE_TIMEOUT_SECONDS)
    if mission_ack is None or mission_ack.type != mavutil.mavlink.MAV_MISSION_ACCEPTED:
        fail(f"mission upload rejected: {mission_ack.type if mission_ack else 'no ack'}")
    log(f"mission uploaded, {len(mission_items)} items")


def take_off(mavlink_connection) -> None:
    mavlink_connection.mav.command_long_send(
        mavlink_connection.target_system, mavlink_connection.target_component,
        mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0,
        *TAKEOFF_UNUSED_PARAMS, TAKEOFF_ALTITUDE_ABOVE_HOME_METERS,
    )
    wait_until(
        lambda: read_altitude_above_home_meters(mavlink_connection) >= TAKEOFF_ALTITUDE_ABOVE_HOME_METERS * ALTITUDE_REACHED_RATIO,
        f"altitude {TAKEOFF_ALTITUDE_ABOVE_HOME_METERS} m",
        TAKEOFF_TIMEOUT_SECONDS,
    )
    log(f"at {TAKEOFF_ALTITUDE_ABOVE_HOME_METERS} m")


def main(connection_url: str) -> None:
    mavlink_connection = mavutil.mavlink_connection(connection_url)
    mavlink_connection.wait_heartbeat()
    log(f"heartbeat from system {mavlink_connection.target_system}")

    # Nobody asked this port for telemetry yet, so SITL sends heartbeats only.
    mavlink_connection.mav.request_data_stream_send(
        mavlink_connection.target_system, mavlink_connection.target_component,
        mavutil.mavlink.MAV_DATA_STREAM_ALL, TELEMETRY_STREAM_RATE_HZ, REQUEST_DATA_STREAM_START,
    )

    wait_until(lambda: read_has_gps_3d_fix(mavlink_connection), "GPS 3D fix", GPS_FIX_TIMEOUT_SECONDS)
    log("gps fix ok")

    start_global_position = read_global_position(mavlink_connection)
    upload_mission(mavlink_connection, build_square_mission(
        start_global_position.lat / DEGREES_TO_E7, start_global_position.lon / DEGREES_TO_E7))

    set_mode(mavlink_connection, "GUIDED")
    arm_with_retries(mavlink_connection)
    log("armed")
    take_off(mavlink_connection)

    # AUTO keeps altitude itself. CIRCLE hands altitude to the throttle stick, which SITL leaves at minimum.
    set_mode(mavlink_connection, "AUTO")
    log("flying the square forever; `mode rtl` in MAVProxy to land")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CONNECTION_URL)
