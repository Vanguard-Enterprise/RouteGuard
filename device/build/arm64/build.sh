#!/bin/bash
set -euo pipefail

ARCH=arm64
SUITE=bookworm
IMG_SIZE_MB=4096
WORK=/tmp/rg-build
OUTPUT=/output

mkdir -p "$WORK" "$OUTPUT"

echo "==> Creating ${IMG_SIZE_MB}MB disk image"
dd if=/dev/zero of="$WORK/routeguard.img" bs=1M count=$IMG_SIZE_MB status=progress

LOOP=$(losetup --find --show "$WORK/routeguard.img")
echo "==> Loop device: $LOOP"

echo "==> Partitioning (GPT: 256MB FAT32 boot + rest root)"
parted -s "$LOOP" mklabel gpt
parted -s "$LOOP" mkpart boot fat32 1MiB 257MiB
parted -s "$LOOP" mkpart primary ext4 257MiB 100%

# Use offset loop devices instead of partition block devices (major 259) which
# are blocked by cgroup eBPF device filters. Offset loop devices use major 7.
BOOT_OFFSET=$((1 * 1024 * 1024))
BOOT_SIZE=$((256 * 1024 * 1024))
ROOT_OFFSET=$((257 * 1024 * 1024))

LOOP_BOOT=$(losetup --find --show --offset "$BOOT_OFFSET" --sizelimit "$BOOT_SIZE" "$WORK/routeguard.img")
LOOP_ROOT=$(losetup --find --show --offset "$ROOT_OFFSET" "$WORK/routeguard.img")
echo "==> Partition loop devices: BOOT=$LOOP_BOOT ROOT=$LOOP_ROOT"

echo "==> Formatting"
mkfs.fat -F32 "$LOOP_BOOT"
mkfs.ext4 -q "$LOOP_ROOT"

ROOT_UUID=$(blkid -s UUID -o value "$LOOP_ROOT")
BOOT_UUID=$(blkid -s UUID -o value "$LOOP_BOOT")

echo "==> Mounting"
mkdir -p "$WORK/rootfs"
mount "$LOOP_ROOT" "$WORK/rootfs"
mkdir -p "$WORK/rootfs/boot/firmware"
mount "$LOOP_BOOT" "$WORK/rootfs/boot/firmware"

echo "==> Bootstrapping Debian $SUITE (arm64) - stage 1"
debootstrap --arch=$ARCH --foreign "$SUITE" "$WORK/rootfs" http://deb.debian.org/debian

echo "==> Copying qemu-aarch64-static for chroot"
cp /usr/bin/qemu-aarch64-static "$WORK/rootfs/usr/bin/"

echo "==> Running debootstrap second stage in chroot (via QEMU)"
chroot "$WORK/rootfs" /debootstrap/debootstrap --second-stage

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
        linux-image-arm64 \
        raspi-firmware \
        chromium \
        xorg openbox x11-xserver-utils unclutter \
        network-manager \
        firmware-brcm80211 firmware-realtek firmware-linux-free \
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

echo "==> Configuring RPi boot"
# Find installed kernel and initrd
VMLINUZ=$(ls "$WORK/rootfs/boot/vmlinuz-"* 2>/dev/null | head -1)
INITRD=$(ls  "$WORK/rootfs/boot/initrd.img-"* 2>/dev/null | head -1)
KERNEL_VER=$(basename "${VMLINUZ:-}" | sed 's/vmlinuz-//')

if [ -z "$VMLINUZ" ]; then
    echo "ERROR: No kernel found in /boot - package installation may have failed"
    exit 1
fi

echo "==> Kernel: $VMLINUZ (version: $KERNEL_VER)"

# Copy kernel and initrd to the FAT32 boot partition
# kernel8.img = ARMv8 (arm64) kernel name that RPi firmware looks for
cp "$VMLINUZ" "$WORK/rootfs/boot/firmware/kernel8.img"
if [ -n "$INITRD" ]; then
    cp "$INITRD" "$WORK/rootfs/boot/firmware/initramfs8"
fi

# Copy DTBs (Raspberry Pi 4 = BCM2711, Pi 3 = BCM2837, Pi 5 = BCM2712)
for DTB_DIR in \
    "$WORK/rootfs/usr/lib/linux-image-${KERNEL_VER}/broadcom" \
    "$WORK/rootfs/lib/firmware/${KERNEL_VER}/device-tree/broadcom"; do
    if [ -d "$DTB_DIR" ]; then
        cp "$DTB_DIR"/*.dtb "$WORK/rootfs/boot/firmware/" 2>/dev/null || true
        echo "==> Copied DTBs from $DTB_DIR"
        break
    fi
done

# Copy overlays
for OVL_DIR in \
    "$WORK/rootfs/usr/lib/linux-image-${KERNEL_VER}/overlays" \
    "$WORK/rootfs/lib/firmware/${KERNEL_VER}/device-tree/overlays"; do
    if [ -d "$OVL_DIR" ]; then
        mkdir -p "$WORK/rootfs/boot/firmware/overlays"
        cp "$OVL_DIR"/*.dtbo "$WORK/rootfs/boot/firmware/overlays/" 2>/dev/null || true
        echo "==> Copied overlays from $OVL_DIR"
        break
    fi
done

# raspi-firmware puts GPU blobs in /usr/lib/raspi-firmware/
# The kernel postinstall hook should have already copied them; do it manually too.
RASPI_FW="$WORK/rootfs/usr/lib/raspi-firmware"
if [ -d "$RASPI_FW" ]; then
    cp "$RASPI_FW"/* "$WORK/rootfs/boot/firmware/" 2>/dev/null || true
    echo "==> Copied raspi-firmware blobs"
fi

# config.txt - RPi bootloader config
cat > "$WORK/rootfs/boot/firmware/config.txt" << EOF
arm_64bit=1
kernel=kernel8.img
EOF
if [ -n "$INITRD" ]; then
    echo "initramfs initramfs8 followkernel" >> "$WORK/rootfs/boot/firmware/config.txt"
fi
cat >> "$WORK/rootfs/boot/firmware/config.txt" << EOF
gpu_mem=16
dtoverlay=vc4-kms-v3d
EOF

# cmdline.txt - kernel command line
echo "console=serial0,115200 console=tty1 root=UUID=$ROOT_UUID rootfstype=ext4 fsck.repair=yes rootwait" \
    > "$WORK/rootfs/boot/firmware/cmdline.txt"

echo "==> Writing fstab"
cat > "$WORK/rootfs/etc/fstab" << EOF
UUID=$ROOT_UUID  /              ext4  errors=remount-ro  0 1
UUID=$BOOT_UUID  /boot/firmware vfat  defaults           0 2
EOF

echo "==> Unmounting"
umount "$WORK/rootfs/proc"
umount "$WORK/rootfs/sys"
umount "$WORK/rootfs/dev/pts"
umount "$WORK/rootfs/dev"
umount "$WORK/rootfs/boot/firmware"
umount "$WORK/rootfs"
losetup -d "$LOOP_BOOT"
losetup -d "$LOOP_ROOT"
losetup -d "$LOOP"

echo "==> Compressing image"
gzip -9 --stdout "$WORK/routeguard.img" > "$OUTPUT/routeguard-arm64-latest.img.gz"
rm "$WORK/routeguard.img"

echo "==> Done: $OUTPUT/routeguard-arm64-latest.img.gz"
