FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    debootstrap \
    parted \
    dosfstools \
    e2fsprogs \
    mtools \
    curl \
    python3 \
    xz-utils \
    gzip \
    util-linux \
    qemu-user-static \
    && apt-get clean

COPY arm64/build.sh /build.sh
COPY common /common
RUN find /common -name "*.sh" | xargs -r sed -i 's/\x0D//' && sed -i 's/\x0D//' /build.sh && chmod +x /build.sh

VOLUME ["/output"]

CMD ["/build.sh"]
