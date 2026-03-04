#!/bin/bash -e

on_chroot << CHROOT
apt-get install -y --no-install-recommends \
    chromium \
    xorg openbox x11-xserver-utils unclutter \
    network-manager \
    linux-firmware firmware-realtek firmware-iwlwifi firmware-mediatek \
    curl python3 \
    ufw

# UFW: allow only DNS and HTTPS outbound
ufw default deny outgoing
ufw default deny incoming
ufw allow out to any port 53 proto udp
ufw allow out 443 proto tcp
ufw --force enable

# Create required directories
mkdir -p /etc/routeguard
mkdir -p /var/lib/routeguard/chromium
CHROOT

# Install common scripts and services
install -m 755 /common/rg-checkin           "${ROOTFS_DIR}/usr/local/bin/"
install -m 755 /common/rg-kiosk.sh          "${ROOTFS_DIR}/usr/local/bin/"
install -m 644 /common/routeguard-kiosk.service \
    "${ROOTFS_DIR}/etc/systemd/system/"

# WiFi config - must be mode 600 or NetworkManager ignores it
install -m 600 /common/routeguard.nmconnection \
    "${ROOTFS_DIR}/etc/NetworkManager/system-connections/"

on_chroot << CHROOT
systemctl enable routeguard-kiosk.service
systemctl enable NetworkManager
CHROOT
