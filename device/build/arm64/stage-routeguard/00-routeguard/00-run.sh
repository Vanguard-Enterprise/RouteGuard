#!/bin/bash -e
on_chroot << EOF
apt-get install -y --no-install-recommends chromium-browser xorg openbox x11-xserver-utils unclutter

# UFW firewall: allow only DNS and HTTPS
apt-get install -y ufw
ufw default deny outgoing
ufw default deny incoming
ufw allow out to any port 53 proto udp
ufw allow out 443 proto tcp
ufw --force enable
EOF

install -m 644 files/routeguard-provision.service "${ROOTFS_DIR}/etc/systemd/system/"
install -m 644 files/routeguard-kiosk.service "${ROOTFS_DIR}/etc/systemd/system/"
install -m 755 files/rg-provision "${ROOTFS_DIR}/usr/local/bin/"
install -m 755 files/rg-kiosk.sh "${ROOTFS_DIR}/usr/local/bin/"

on_chroot << EOF
systemctl enable routeguard-provision.service
systemctl enable routeguard-kiosk.service
EOF
