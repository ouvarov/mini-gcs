# Built from source so it runs natively on arm64, no emulation.
FROM ubuntu:22.04

ARG ARDUPILOT_REF=Copter-4.7.1
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends git sudo lsb-release tzdata ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash ardupilot \
  && echo "ardupilot ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ardupilot

USER ardupilot
WORKDIR /home/ardupilot

RUN git clone --depth 1 --branch ${ARDUPILOT_REF} --recurse-submodules --shallow-submodules \
  https://github.com/ArduPilot/ardupilot.git

WORKDIR /home/ardupilot/ardupilot

# install-prereqs runs `usermod ... $USER`; Docker leaves USER unset.
ENV USER=ardupilot \
  SKIP_AP_GIT_CHECK=1 \
  SKIP_AP_GRAPHIC_ENV=1 \
  SKIP_AP_COV_ENV=1 \
  SKIP_AP_EXT_ENV=1 \
  DO_AP_STM_ENV=0
RUN Tools/environment_install/install-prereqs-ubuntu.sh -y \
  && sudo rm -rf /var/lib/apt/lists/*

ENV PATH="/home/ardupilot/.local/bin:/home/ardupilot/ardupilot/Tools/autotest:${PATH}"

RUN ./waf configure --board sitl && ./waf copter

# 5760 is taken by MAVProxy inside; 5762 and 5763 are for the app and scripts.
EXPOSE 5762/tcp 5763/tcp

ENTRYPOINT ["sim_vehicle.py", "-v", "ArduCopter", "--no-rebuild"]
