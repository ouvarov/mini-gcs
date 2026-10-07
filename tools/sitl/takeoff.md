# Flying the SITL copter

## Automatic: arm, take off to 50 m, fly a looping square

```sh
npm run sitl:fly        # in a second terminal while `npm run sitl` is running
```

`tools/sitl/fly.py` runs inside the container over SITL's third MAVLink port (tcp 5763). It uploads a six-item
mission (home placeholder, four corners 300 m from home at 60 m, DO_JUMP back to the first corner forever), waits
for GPS fix, arms in GUIDED, takes off to 50 m and switches to AUTO. That port sends heartbeats only until a client
asks for streams, so the script requests them first.

Why AUTO and not CIRCLE: in CIRCLE the throttle stick owns altitude, and SITL without a transmitter keeps it at
minimum, so the copter sinks at ~1 m/s and lands. The first version of this script did exactly that.

Killing `npm run sitl:fly` on the host (Ctrl+C) leaves the Python process alive inside the container, and it keeps
port 5763, so the next run blocks on the first heartbeat. Clean up with:

```sh
docker exec mini-gcs-sitl pkill -f "^python3 -$"
```

SITL ports: 5760 belongs to MAVProxy inside the container (a second client gets no bytes), 5762 is published for
the app's "TCP client" transport, 5763 for scripts. The app does not request streams yet, so over TCP it sees
heartbeats only; use UDP until that lands (Named debt in README).

## Manual: MAVProxy console

`npm run sitl` leaves you in a MAVProxy prompt (`MAV>`). The autopilot boots in ~10 s, then needs GPS lock and
EKF alignment before it lets you arm: wait for a line like `EKF3 IMU0 is using GPS` (another ~20-30 s).

```
mode guided
arm throttle
takeoff 50
```

The copter climbs to 50 m above home and holds. Make it move:

```
# fly to a point 400 m north-east of home, keep 50 m
guided 50.4537 30.5285 50

# CIRCLE needs a mid throttle stick or it sinks; give it one first
rc 3 1500
mode circle
param set CIRCLE_RADIUS 40000   # centimetres
param set CIRCLE_RATE 2         # degrees per second
```

Useful while developing:

```
set streamrate 50           # telemetry Hz on this link (stress the parser)
param set SIM_SPEEDUP 1     # 1 = real time, 5 = five times faster
param set SIM_WIND_SPD 8    # m/s, makes the Kalman filter work for its money
mode rtl                    # return and land
```

Stop with `Ctrl+C` in the console; the container removes itself.

## Running SITL in the background

```sh
docker run -d -t --name mini-gcs-sitl -p 5762:5762 -p 5763:5763 mini-gcs-sitl \
  --custom-location=50.4501,30.5234,180,0 --out udp:host.docker.internal:14550
docker attach mini-gcs-sitl     # MAV> console; detach with Ctrl+P, Ctrl+Q
docker stop mini-gcs-sitl
```

`-t` matters: without a pseudo-TTY MAVProxy exits on closed stdin and SITL shuts down with it.

## Second client

Only one process can bind UDP 14550. To watch QGroundControl next to the app, start SITL with an extra output and point the app at it:

```sh
GCS_UDP_PORT=14551 npm run sitl
```

then in the app set port 14551 while QGroundControl keeps its default UDP 14550. QGC can also take TCP 127.0.0.1:5762 (Comm Links → TCP), but then the app's TCP transport has no free port.
