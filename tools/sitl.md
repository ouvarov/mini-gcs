# Getting a MAVLink stream without a drone

Four sources, from the quickest to the most realistic. The app listens on UDP 14550 by default, like QGroundControl.

## 1. Fake vehicle (in this repo, ten seconds)

```sh
npm run fake                                        # 10 Hz, no loss
npm run fake -- --rate 50 --loss 0.2 --jitter 300   # stress: 50 Hz, 20 % loss, up to 300 ms jitter
```

Flies a circle over Kyiv and sends HEARTBEAT, GLOBAL_POSITION_INT, ATTITUDE, VFR_HUD, SYS_STATUS, GPS_RAW_INT.
It is not a flight model: no inertia, no wind, no missions. Good for the parser, IPC, HUD and load tests; not for a demo.

Check the parser without Electron:

```sh
npm run smoke -- --seconds 5
```

## 2. ArduPilot SITL in Docker (the main path, a real autopilot)

```sh
npm run sitl            # first run builds the image in 10-20 minutes, later runs start in seconds
npm run sitl:fly        # second terminal: upload a looping mission, arm, take off, AUTO
npm run record -- --seconds 60 --out fixtures/my-flight.tlog   # record a .tlog over SITL's TCP 5762
```

The Dockerfile in `tools/sitl/` clones ArduPilot (tag Copter-4.7.1) inside the build and compiles SITL for the host
architecture; on Apple Silicon that is native arm64 with no emulation. Nothing is cloned on the host, only the
`mini-gcs-sitl` image remains (`docker rmi mini-gcs-sitl` removes it).

The terminal becomes a MAVProxy console; flight commands are in `tools/sitl/takeoff.md`. Telemetry reaches the app
over UDP on 127.0.0.1:14550 through `host.docker.internal`; change the port with `GCS_UDP_PORT=14551 npm run sitl`.
Port 5762 is published for the app's “TCP client” transport (5760 belongs to MAVProxy inside the container), 5763 for scripts.

Stop `npm run fake` before starting SITL, or two streams land on one port.

## 3. ArduPilot SITL natively on macOS (fallback)

Official guide: https://ardupilot.org/dev/docs/building-setup-mac.html and
https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html

```sh
git clone --recurse-submodules https://github.com/ArduPilot/ardupilot.git ~/ardupilot
# dependencies: Tools/environment_install/install-prereqs-mac.sh (brew + pip), then:
~/ardupilot/Tools/autotest/sim_vehicle.py -v ArduCopter --console --map --out udp:127.0.0.1:14550
```

- `--out udp:127.0.0.1:14550` streams into the app (UDP listen).
- SITL also serves TCP 5760 (MAVProxy takes it), 5762 and 5763 for extra clients.
- MAVProxy console: `mode guided`, `arm throttle`, `takeoff 50`, then right-click the map → Fly To.
- Telemetry rate: `set streamrate 50` in MAVProxy, or the `SR0_POSITION`, `SR0_EXTRA1` … parameters.

On a machine where Homebrew lives in /usr/local under Rosetta, the prereq script may install x86 Python and
libraries. If the build fights you, install native Homebrew in /opt/homebrew and build from there; check `arch` and
`brew --prefix` first.

## 4. PX4 SITL (a second autopilot, if ever needed)

https://docs.px4.io/main/en/sim_jmavsim/ — `make px4_sitl jmavsim`. Streams UDP 14550 for the GCS.
Different MAVLink dialect (no ardupilotmega), same common messages. Less relevant for ArduPilot-based work.

## 5. Record and replay (.tlog)

Any MAVLink stream can be recorded to a .tlog (MAVProxy writes one into `--state-basedir`, QGroundControl too, this
app has a Record button) and replayed with timing. The app's “Replay .tlog” transport does it; `mavplayback.py` from
pymavlink does the same from the command line.

## Reference client

QGroundControl (https://qgroundcontrol.com): run it next to the app on the same SITL and compare HUD values.
Two processes cannot bind one UDP port; give SITL a second `--out udp:127.0.0.1:14551` or point QGC at TCP 5762.
