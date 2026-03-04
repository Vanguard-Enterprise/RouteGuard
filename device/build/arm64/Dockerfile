FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    git quilt parted qemu-user-static debootstrap zerofree \
    zip dosfstools bsdmainutils libcap2-bin grep rsync xz-utils \
    file git curl bc bash python3 \
    libarchive-tools xxd kmod pigz \
    && apt-get clean

RUN git clone --depth 1 https://github.com/RPi-Distro/pi-gen.git /pi-gen

# qemu-user-binfmt conflicts with qemu-user-static on Debian; patch whichever
# pi-gen file references it so qemu-user-static is accepted instead.
RUN find /pi-gen -type f | xargs grep -rl "qemu-user-binfmt" | xargs -r sed -i 's/qemu-user-binfmt/qemu-user-static/g'

WORKDIR /pi-gen
COPY arm64/config ./config
COPY arm64/stage-routeguard ./stage-routeguard
COPY common /common
RUN chmod +x stage-routeguard/00-routeguard/00-run.sh

# binfmt_misc is built-in on PVE kernels (not a loadable module). Mount it
# directly, then register the QEMU ARM handler by writing directly to the
# register file (avoids needing binfmt-support package / update-binfmts).
CMD ["bash", "-c", "\
  mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc 2>/dev/null || true; \
  echo ':qemu-arm:M::\\x7fELF\\x01\\x01\\x01\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x02\\x00\\x28\\x00:\\xff\\xff\\xff\\xff\\xff\\xff\\xff\\x00\\xff\\xff\\xff\\xff\\xff\\xff\\xff\\xff\\xfe\\xff\\xff\\xff:/usr/bin/qemu-arm-static:F' > /proc/sys/fs/binfmt_misc/register 2>/dev/null || true; \
  bash build.sh"]
