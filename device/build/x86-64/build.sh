#!/bin/bash
set -euo pipefail

ARCH=amd64
SUITE=bookworm
IMG_SIZE_MB=4096
WORK=/tmp/rg-build
OUTPUT=/output

mkdir -p "$WORK" "$OUTPUT"

# Ensure loop devices exist in the container. --privileged gives CAP_MKNOD so
# mknod works even when the host loop devices are busy or not bind-mounted.
for i in $(seq 0 7); do
    [ -b /dev/loop$i ] || mknod /dev/loop$i b 7 $i 2>/dev/null || true
done

echo "==> Creating ${IMG_SIZE_MB}MB disk image"
dd if=/dev/zero of="$WORK/routeguard.img" bs=1M count=$IMG_SIZE_MB status=progress

LOOP=$(losetup --find --partscan --show "$WORK/routeguard.img")
echo "==> Loop device: $LOOP"

echo "==> Partitioning (GPT: 256MB EFI + rest root)"
parted -s "$LOOP" mklabel gpt
parted -s "$LOOP" mkpart ESP fat32 1MiB 257MiB
parted -s "$LOOP" set 1 esp on
parted -s "$LOOP" mkpart primary ext4 257MiB 100%

partprobe "$LOOP"
sleep 1

echo "==> Formatting"
mkfs.fat -F32 "${LOOP}p1"
mkfs.ext4 -q "${LOOP}p2"

ROOT_UUID=$(blkid -s UUID -o value "${LOOP}p2")
EFI_UUID=$(blkid -s UUID -o value "${LOOP}p1")

echo "==> Mounting"
mkdir -p "$WORK/rootfs"
mount "${LOOP}p2" "$WORK/rootfs"
mkdir -p "$WORK/rootfs/boot/efi"
mount "${LOOP}p1" "$WORK/rootfs/boot/efi"

echo "==> Bootstrapping Debian $SUITE"
debootstrap --arch=$ARCH "$SUITE" "$WORK/rootfs" http://deb.debian.org/debian

echo "==> Configuring apt with non-free firmware"
cat > "$WORK/rootfs/etc/apt/sources.list" << EOF
deb http://deb.debian.org/debian $SUITE main contrib non-free non-free-firmware
deb http://security.debian.org/debian-security $SUITE-security main contrib non-free non-free-firmware
deb http://deb.debian.org/debian $SUITE-updates main contrib non-free non-free-firmware
EOF

echo "==> Mounting bind mounts for chroot"
mount --bind /dev     "$WORK/rootfs/dev"
mount --bind /dev/pts "$WORK/rootfs/dev/pts"
mount --bind /sys     "$WORK/rootfs/sys"
mount --bind /proc    "$WORK/rootfs/proc"
cp /etc/resolv.conf "$WORK/rootfs/etc/resolv.conf"

echo "==> Installing packages"
chroot "$WORK/rootfs" bash -c "
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q
    apt-get install -y --no-install-recommends \
        linux-image-amd64 \
        grub-efi-amd64 \
        chromium \
        xorg openbox x11-xserver-utils unclutter \
        network-manager \
        linux-firmware firmware-realtek firmware-iwlwifi firmware-mediatek \
        curl python3 \
        ufw \
        systemd-sysv \
        locales
"

echo "==> Configuring system"
chroot "$WORK/rootfs" bash -c "
    # Hostname
    echo routeguard > /etc/hostname
    echo '127.0.1.1 routeguard' >> /etc/hosts

    # Locale
    echo 'en_US.UTF-8 UTF-8' > /etc/locale.gen
    locale-gen

    # routeguard user
    useradd -m -s /bin/bash routeguard
    echo 'routeguard:routeguard' | chpasswd

    # Required directories
    mkdir -p /etc/routeguard
    mkdir -p /var/lib/routeguard/chromium
    chown -R routeguard:routeguard /var/lib/routeguard

    # UFW
    ufw default deny outgoing
    ufw default deny incoming
    ufw allow out to any port 53 proto udp
    ufw allow out 443 proto tcp
    ufw --force enable

    # NetworkManager
    systemctl enable NetworkManager
"

echo "==> Installing common files"
install -m 755 /common/rg-checkin   "$WORK/rootfs/usr/local/bin/"
install -m 755 /common/rg-kiosk.sh  "$WORK/rootfs/usr/local/bin/"
install -m 644 /common/routeguard-kiosk.service \
    "$WORK/rootfs/etc/systemd/system/"
mkdir -p "$WORK/rootfs/etc/NetworkManager/system-connections"
install -m 600 /common/routeguard.nmconnection \
    "$WORK/rootfs/etc/NetworkManager/system-connections/"

chroot "$WORK/rootfs" systemctl enable routeguard-kiosk.service

echo "==> Installing GRUB EFI"
chroot "$WORK/rootfs" grub-install \
    --target=x86_64-efi \
    --efi-directory=/boot/efi \
    --bootloader-id=routeguard \
    --removable \
    --no-nvram

mkdir -p "$WORK/rootfs/boot/grub"
cat > "$WORK/rootfs/boot/grub/grub.cfg" << EOF
set timeout=0
set default=0
menuentry "RouteGuard" {
    linux /boot/vmlinuz root=UUID=$ROOT_UUID ro quiet
    initrd /boot/initrd.img
}
EOF

echo "==> Writing fstab"
cat > "$WORK/rootfs/etc/fstab" << EOF
UUID=$ROOT_UUID  /         ext4  errors=remount-ro  0 1
UUID=$EFI_UUID   /boot/efi vfat  umask=0077         0 2
EOF

echo "==> Unmounting"
umount "$WORK/rootfs/proc"
umount "$WORK/rootfs/sys"
umount "$WORK/rootfs/dev/pts"
umount "$WORK/rootfs/dev"
umount "$WORK/rootfs/boot/efi"
umount "$WORK/rootfs"
losetup -d "$LOOP"

echo "==> Compressing image"
gzip -9 --stdout "$WORK/routeguard.img" > "$OUTPUT/routeguard-latest.img.gz"
rm "$WORK/routeguard.img"

echo "==> Done: $OUTPUT/routeguard-latest.img.gz"
