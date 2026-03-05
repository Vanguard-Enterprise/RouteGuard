FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    debootstrap \
    parted \
    dosfstools \
    e2fsprogs \
    grub-efi-amd64-bin \
    grub-common \
    mtools \
    curl \
    python3 \
    xz-utils \
    gzip \
    util-linux \
    && apt-get clean

COPY x86-64/build.sh /build.sh
COPY common /common
RUN find /common -type f | xargs -r sed -i 's/\x0D//' && sed -i 's/\x0D//' /build.sh && chmod +x /build.sh /common/rg-checkin /common/rg-kiosk.sh

VOLUME ["/output"]

CMD ["/build.sh"]
