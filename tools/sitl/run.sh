#!/usr/bin/env sh
# Starts ArduCopter SITL in Docker; MAVLink goes to the host over UDP (GCS_UDP_PORT, default 14550).
set -eu

IMAGE_NAME="mini-gcs-sitl"
CONTAINER_NAME="mini-gcs-sitl"
GCS_UDP_PORT="${GCS_UDP_PORT:-14550}"
# Same spot the fake vehicle circles, so the map does not jump between sources.
HOME_LATITUDE_DEGREES="50.4501"
HOME_LONGITUDE_DEGREES="30.5234"
HOME_ALTITUDE_ABOVE_SEA_LEVEL_METERS="180"
HOME_HEADING_DEGREES="0"
# SITL's second and third MAVLink TCP ports; the first (5760) is taken by MAVProxy inside the container.
SITL_APP_TCP_PORT="5762"   # keep in sync with src/shared/defaults.ts
SITL_SCRIPT_TCP_PORT="5763" # keep in sync with src/shared/defaults.ts and tools/sitl/fly.py
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "Building $IMAGE_NAME (first run only, 10-20 minutes)..."
  docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
fi

# macOS Docker has no host networking; use host.docker.internal.
exec docker run --rm -it \
  --name "$CONTAINER_NAME" \
  -p "$SITL_APP_TCP_PORT:$SITL_APP_TCP_PORT" \
  -p "$SITL_SCRIPT_TCP_PORT:$SITL_SCRIPT_TCP_PORT" \
  "$IMAGE_NAME" \
  --custom-location="$HOME_LATITUDE_DEGREES,$HOME_LONGITUDE_DEGREES,$HOME_ALTITUDE_ABOVE_SEA_LEVEL_METERS,$HOME_HEADING_DEGREES" \
  --out "udp:host.docker.internal:$GCS_UDP_PORT"
