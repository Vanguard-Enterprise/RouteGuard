#!/bin/bash
set -euo pipefail

ARCH=amd64
SUITE=bookworm
IMG_SIZE_MB=4096
WORK=/tmp/rg-build
OUTPUT=/output

mkdir -p "$WORK" "$OUTPUT"

echo "==> Creating ${IMG_SIZE_MB}MB disk image"
dd if=/dev/zero of="$WORK/routeguard.img" bs=1M count=$IMG_SIZE_MB status=progress

LOOP=$(losetup --find --show "$WORK/routeguard.img")
echo "==> Loop device: $LOOP"

echo "==> Partitioning (GPT: 256MB EFI + rest root)"
parted -s "$LOOP" mklabel gpt
parted -s "$LOOP" mkpart ESP fat32 1MiB 257MiB
parted -s "$LOOP" set 1 esp on
parted -s "$LOOP" mkpart primary ext4 257MiB 100%

# Use offset loop devices instead of partition block devices (major 259) which
# are blocked by the LXC cgroup eBPF device filter. Offset loop devices use
# major 7 which is already allowed.
EFI_OFFSET=$((1 * 1024 * 1024))
EFI_SIZE=$((256 * 1024 * 1024))
ROOT_OFFSET=$((257 * 1024 * 1024))
# parted with 1MiB alignment ends the last partition 1MiB before the image end
# (reserves space for backup GPT). Match that exactly so ext4 block count fits.
ROOT_SIZE=$(( (IMG_SIZE_MB - 1 - 257) * 1024 * 1024 ))

LOOP_EFI=$(losetup --find --show --offset "$EFI_OFFSET" --sizelimit "$EFI_SIZE" "$WORK/routeguard.img")
LOOP_ROOT=$(losetup --find --show --offset "$ROOT_OFFSET" --sizelimit "$ROOT_SIZE" "$WORK/routeguard.img")
echo "==> Partition loop devices: EFI=$LOOP_EFI ROOT=$LOOP_ROOT"

echo "==> Formatting"
mkfs.fat -F32 "$LOOP_EFI"
mkfs.ext4 -q "$LOOP_ROOT"

ROOT_UUID=$(blkid -s UUID -o value "$LOOP_ROOT")
EFI_UUID=$(blkid -s UUID -o value "$LOOP_EFI")

echo "==> Mounting"
mkdir -p "$WORK/rootfs"
mount "$LOOP_ROOT" "$WORK/rootfs"
mkdir -p "$WORK/rootfs/boot/efi"
mount "$LOOP_EFI" "$WORK/rootfs/boot/efi"

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

echo "==> Installing base packages (udev + initramfs first so kernel post-install works)"
chroot "$WORK/rootfs" bash -c "
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q
    apt-get install -y --no-install-recommends \
        udev \
        kmod \
        initramfs-tools \
        busybox
"

echo "==> Installing kernel and remaining packages"
chroot "$WORK/rootfs" bash -c "
    export DEBIAN_FRONTEND=noninteractive
    apt-get install -y --no-install-recommends \
        linux-image-amd64 \
        grub-efi-amd64 \
        wpasupplicant \
        chromium \
        xorg openbox x11-xserver-utils unclutter \
        network-manager \
        firmware-linux-free firmware-realtek firmware-iwlwifi \
        curl python3 \
        ufw \
        systemd-sysv \
        locales
"

echo "==> Regenerating initramfs"
chroot "$WORK/rootfs" bash -c "
    export DEBIAN_FRONTEND=noninteractive
    update-initramfs -u -k all
"

echo "==> Configuring system"
chroot "$WORK/rootfs" bash -c "
    # Hostname
    echo routeguard > /etc/hostname
    echo '127.0.1.1 routeguard' >> /etc/hosts

    # Locale
    echo 'en_US.UTF-8 UTF-8' > /etc/locale.gen
    locale-gen

    # Set root password
    echo 'root:routeguard' | chpasswd

    # routeguard user
    useradd -m -s /bin/bash routeguard
    echo 'routeguard:routeguard' | chpasswd

    # Required directories
    mkdir -p /etc/routeguard
    mkdir -p /var/lib/routeguard/chromium
    chown -R routeguard:routeguard /var/lib/routeguard

    # UFW (best-effort in chroot - iptables may not be available)
    ufw default deny outgoing  || true
    ufw default deny incoming  || true
    ufw allow out to any port 53 proto udp || true
    ufw allow out 443 proto tcp || true
    ufw --force enable || true

    # NetworkManager
    systemctl enable NetworkManager

    # Ensure NetworkManager manages all wifi interfaces
    mkdir -p /etc/NetworkManager/conf.d
    cat > /etc/NetworkManager/conf.d/managed.conf << 'NMCONF'
[device]
wifi.scan-rand-mac-address=no

[main]
plugins=ifupdown,keyfile

[ifupdown]
managed=true
NMCONF
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
    --no-nvram \
    --modules="part_gpt part_msdos ext2 fat normal linux echo ls search search_fs_uuid gfxterm efi_gop efi_uga"

mkdir -p "$WORK/rootfs/boot/grub"

# Resolve the actual versioned kernel and initrd filenames
KERNEL=$(chroot "$WORK/rootfs" sh -c 'ls /boot/vmlinuz-* | sort -V | tail -1' | sed 's|/boot/||')
INITRD=$(chroot "$WORK/rootfs" sh -c 'ls /boot/initrd.img-* | sort -V | tail -1' | sed 's|/boot/||')
echo "==> Kernel: $KERNEL  Initrd: $INITRD"

if [ -z "$KERNEL" ] || [ -z "$INITRD" ]; then
    echo "ERROR: kernel or initrd not found in /boot"
    ls "$WORK/rootfs/boot/" || true
    exit 1
fi

cat > "$WORK/rootfs/boot/grub/grub.cfg" << EOF
set timeout=0
set default=0

insmod part_gpt
insmod ext2
insmod search_fs_uuid

search --no-floppy --fs-uuid --set=root $ROOT_UUID

menuentry "RouteGuard" {
    linux /boot/$KERNEL root=UUID=$ROOT_UUID ro quiet
    initrd /boot/$INITRD
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
losetup -d "$LOOP_EFI"
losetup -d "$LOOP_ROOT"
losetup -d "$LOOP"

echo "==> Compressing image"
gzip -9 --stdout "$WORK/routeguard.img" > "$OUTPUT/routeguard-latest.img.gz"
rm "$WORK/routeguard.img"

echo "==> Done: $OUTPUT/routeguard-latest.img.gz"
