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

# binfmt_misc is built-in on PVE kernels so mount it directly, then re-register
# QEMU handlers (qemu-user-static's post-install ran at build time when
# binfmt_misc wasn't mounted, so the handlers were never written).
CMD ["bash", "-c", "mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc 2>/dev/null || true && update-binfmts --enable 2>/dev/null || true && bash build.sh"]
