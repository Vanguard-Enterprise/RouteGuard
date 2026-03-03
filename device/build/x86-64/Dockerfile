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
RUN chmod +x /build.sh

VOLUME ["/output"]

CMD ["/build.sh"]
