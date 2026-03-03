# Device Image Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing pi-gen-only device build with two Debian 12 pipelines (ARM64 and x86-64) sharing a common application layer that implements the check-in/claim provisioning flow.

**Architecture:** Common scripts and systemd units live in `device/build/common/` and are installed by both build pipelines. ARM64 uses pi-gen (updated). x86-64 uses a debootstrap + loopback disk image script producing a UEFI-bootable GPT image. GitHub Actions builds both on changes to `device/` and uploads `.img.gz` files to RustFS.

**Tech Stack:** Debian 12 Bookworm, Chromium, openbox, NetworkManager, systemd, pi-gen, debootstrap, GRUB EFI, Docker, GitHub Actions, MinIO client (mc).

---

## Task 1: Restructure Device Directory

**Files:**
- Delete: `device/pi-gen/` (move contents to new structure)
- Create: `device/build/arm64/config`
- Create: `device/build/arm64/Dockerfile`
- Create: `device/build/arm64/stage-routeguard/00-routeguard/00-run.sh`
- Create: `device/build/common/` (empty dir with .gitkeep)
- Create: `device/build/x86-64/` (empty dir with .gitkeep)

**Step 1: Create new directory structure**

```bash
mkdir -p device/build/common
mkdir -p device/build/arm64/stage-routeguard/00-routeguard/files
mkdir -p device/build/x86-64
```

**Step 2: Move existing pi-gen files into arm64/**

```bash
cp device/pi-gen/config device/build/arm64/config
cp device/pi-gen/Dockerfile device/build/arm64/Dockerfile
cp device/pi-gen/stage-routeguard/00-routeguard/00-run.sh \
   device/build/arm64/stage-routeguard/00-routeguard/00-run.sh
```

**Step 3: Update arm64/Dockerfile to reference new path**

The Dockerfile currently copies `stage-routeguard` from the pi-gen root. It should stay
the same but now lives at `device/build/arm64/Dockerfile`. Verify the COPY paths still
work relative to the new build context:

```dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    git quilt parted qemu-user-static debootstrap zerofree \
    zip dosfstools bsdmainutils libcap2-bin grep rsync xz-utils \
    file git curl bc bash python3 \
    && apt-get clean

RUN git clone --depth 1 https://github.com/RPi-Distro/pi-gen.git /pi-gen

WORKDIR /pi-gen
COPY config ./config
COPY stage-routeguard ./stage-routeguard
COPY ../common /common
RUN chmod +x stage-routeguard/00-routeguard/00-run.sh

CMD ["bash", "build.sh"]
```

**Step 4: Delete old device/pi-gen/**

```bash
git rm -r device/pi-gen/
```

**Step 5: Commit**

```bash
git add device/
git commit -m "refactor: restructure device build into arm64/x86-64/common layout"
```

---

## Task 2: Common - rg-checkin Script

**Files:**
- Create: `device/build/common/rg-checkin`

This script runs on first boot (before kiosk). If a token already exists it exits
immediately. Otherwise it registers with the API, shows the claim code, and polls
until the device is claimed. It is called from `rg-kiosk.sh`, not as its own service.

**Step 1: Create rg-checkin**

```bash
cat > device/build/common/rg-checkin << 'SCRIPT'
#!/bin/bash
set -e

API_URL="${RG_API_URL:-https://api.route-guard.com}"
TOKEN_FILE="/etc/routeguard/token"
SERIAL_FILE="/etc/routeguard/serial"

# Already claimed - nothing to do
if [ -f "$TOKEN_FILE" ]; then
    exit 0
fi

# --- Determine serial number ---
get_serial() {
    # Raspberry Pi
    local rpi_serial
    rpi_serial=$(grep "^Serial" /proc/cpuinfo 2>/dev/null | awk '{print $3}' | tr -d '[:space:]')
    if [ -n "$rpi_serial" ] && [ "$rpi_serial" != "0000000000000000" ]; then
        echo "$rpi_serial"
        return
    fi

    # x86-64 DMI product serial
    local dmi_serial
    dmi_serial=$(cat /sys/class/dmi/id/product_serial 2>/dev/null | tr -d '[:space:]')
    if [ -n "$dmi_serial" ] \
        && [ "$dmi_serial" != "ToBeFilledByO.E.M." ] \
        && [ "$dmi_serial" != "Defaultstring" ] \
        && [ "$dmi_serial" != "None" ]; then
        echo "$dmi_serial"
        return
    fi

    # Fall back to generated UUID persisted on disk
    if [ -f "$SERIAL_FILE" ]; then
        cat "$SERIAL_FILE"
        return
    fi
    mkdir -p /etc/routeguard
    python3 -c "import uuid; print(str(uuid.uuid4()))" > "$SERIAL_FILE"
    cat "$SERIAL_FILE"
}

SERIAL=$(get_serial)
if [ -z "$SERIAL" ]; then
    echo "rg-checkin: ERROR: could not determine device serial" >&2
    exit 1
fi
echo "rg-checkin: serial=$SERIAL"

# --- Register with API ---
RESPONSE=$(curl -sf -X POST "$API_URL/api/v1/devices/checkin" \
    -H "Content-Type: application/json" \
    -d "{\"serial\": \"$SERIAL\"}" 2>&1) || {
    echo "rg-checkin: ERROR: checkin API call failed: $RESPONSE" >&2
    exit 1
}

CLAIM_CODE=$(echo "$RESPONSE" | python3 -c \
    "import json,sys; print(json.load(sys.stdin)['claim_code'])")

if [ -z "$CLAIM_CODE" ]; then
    echo "rg-checkin: ERROR: no claim_code in response" >&2
    exit 1
fi
echo "rg-checkin: claim_code=$CLAIM_CODE"

# --- Show claim code page ---
CLAIM_HTML="/tmp/rg-claim.html"
cat > "$CLAIM_HTML" << EOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>RouteGuard - Claim Device</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1B3A5C;
      color: white;
      font-family: sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      flex-direction: column;
      gap: 20px;
    }
    .label { font-size: 20px; opacity: 0.75; }
    .code {
      font-size: 80px;
      font-weight: bold;
      letter-spacing: 14px;
      color: #F5A825;
      font-family: monospace;
    }
    .hint { font-size: 15px; opacity: 0.55; text-align: center; max-width: 420px; }
  </style>
</head>
<body>
  <div class="label">Enter this code in the RouteGuard dashboard</div>
  <div class="code">$CLAIM_CODE</div>
  <div class="hint">Dashboard &rarr; Devices &rarr; Add Device</div>
</body>
</html>
EOF

chromium-browser \
    --app="file://$CLAIM_HTML" \
    --no-first-run \
    --disable-infobars \
    --noerrdialogs &
CHROMIUM_PID=$!

# --- Poll until claimed ---
echo "rg-checkin: polling for claim..."
while true; do
    STATUS=$(curl -sf \
        "$API_URL/api/v1/devices/checkin/status?serial=$SERIAL" 2>/dev/null || echo "")
    if [ -n "$STATUS" ]; then
        TOKEN=$(echo "$STATUS" | python3 -c \
            "import json,sys; d=json.load(sys.stdin); print(d.get('device_token',''))" \
            2>/dev/null || echo "")
        if [ -n "$TOKEN" ]; then
            echo "rg-checkin: device claimed, storing token"
            mkdir -p /etc/routeguard
            echo "$TOKEN" > "$TOKEN_FILE"
            chmod 600 "$TOKEN_FILE"
            kill "$CHROMIUM_PID" 2>/dev/null || true
            exit 0
        fi
    fi
    sleep 5
done
SCRIPT
chmod +x device/build/common/rg-checkin
```

**Step 2: Write a quick smoke test in a Docker container**

```bash
docker run --rm -v $(pwd)/device/build/common:/common debian:bookworm-slim \
    bash -c "
        # Simulate token already present - should exit 0 immediately
        mkdir -p /etc/routeguard
        echo 'test-token' > /etc/routeguard/token
        /common/rg-checkin && echo 'PASS: exits 0 when token exists'
    "
```

Expected: `PASS: exits 0 when token exists`

**Step 3: Commit**

```bash
git add device/build/common/rg-checkin
git commit -m "feat: add rg-checkin script for device check-in/claim flow"
```

---

## Task 3: Common - rg-kiosk.sh

**Files:**
- Create: `device/build/common/rg-kiosk.sh`

Replaces the old `rg-kiosk.sh`. Starts Xorg, calls `rg-checkin` if not yet claimed,
injects the device token via a Chromium extension, then launches Chromium in kiosk mode.

**Step 1: Create rg-kiosk.sh**

```bash
cat > device/build/common/rg-kiosk.sh << 'SCRIPT'
#!/bin/bash
set -e

TOKEN_FILE="/etc/routeguard/token"
EXT_DIR="/etc/routeguard/extension"
APP_URL="https://app.route-guard.com/driver"
CHROMIUM_DATA="/var/lib/routeguard/chromium"

# Start X display on VT1
Xorg :0 vt1 -nolisten tcp &
XORG_PID=$!
export DISPLAY=:0
sleep 2  # give X time to initialise

# Start openbox window manager
openbox &

# Run check-in if this device is not yet claimed
/usr/local/bin/rg-checkin

# Read token
TOKEN=$(cat "$TOKEN_FILE" | tr -d '[:space:]')

# Write bootstrap extension - injects device_token into the app's localStorage
mkdir -p "$EXT_DIR"
cat > "$EXT_DIR/manifest.json" << 'MANIFEST'
{
  "name": "RouteGuard Bootstrap",
  "version": "1.0",
  "manifest_version": 3,
  "content_scripts": [{
    "matches": ["https://app.route-guard.com/*"],
    "js": ["bootstrap.js"],
    "run_at": "document_start",
    "world": "MAIN"
  }]
}
MANIFEST

cat > "$EXT_DIR/bootstrap.js" << EOF
(function () {
  var t = "${TOKEN}";
  if (t && !localStorage.getItem('device_token')) {
    localStorage.setItem('device_token', t);
  }
})();
EOF

mkdir -p "$CHROMIUM_DATA"

exec chromium-browser \
    --kiosk \
    --app="$APP_URL" \
    --load-extension="$EXT_DIR" \
    --disable-extensions-except="$EXT_DIR" \
    --user-data-dir="$CHROMIUM_DATA" \
    --no-first-run \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-translate \
    --noerrdialogs \
    --disable-features=TranslateUI
SCRIPT
chmod +x device/build/common/rg-kiosk.sh
```

**Step 2: Commit**

```bash
git add device/build/common/rg-kiosk.sh
git commit -m "feat: add rg-kiosk.sh with token injection via Chromium extension"
```

---

## Task 4: Common - Systemd Unit and WiFi Config

**Files:**
- Create: `device/build/common/routeguard-kiosk.service`
- Create: `device/build/common/routeguard.nmconnection`

**Step 1: Create systemd service**

```bash
cat > device/build/common/routeguard-kiosk.service << 'EOF'
[Unit]
Description=RouteGuard Kiosk
After=network-online.target
Wants=network-online.target

[Service]
User=root
ExecStart=/usr/local/bin/rg-kiosk.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

**Step 2: Create NetworkManager WiFi connection**

This bakes the development WiFi into the image. NetworkManager reads files in
`/etc/NetworkManager/system-connections/` at startup and auto-connects.

```bash
cat > device/build/common/routeguard.nmconnection << 'EOF'
[connection]
id=routeguard
type=wifi
autoconnect=true

[wifi]
ssid=routeguard
mode=infrastructure

[wifi-security]
key-mgmt=wpa-psk
psk=routeguard

[ipv4]
method=auto

[ipv6]
method=auto
EOF
```

**Step 3: Commit**

```bash
git add device/build/common/routeguard-kiosk.service \
        device/build/common/routeguard.nmconnection
git commit -m "feat: add kiosk systemd service and dev WiFi config"
```

---

## Task 5: Update ARM64 Pi-gen Stage

**Files:**
- Modify: `device/build/arm64/stage-routeguard/00-routeguard/00-run.sh`
- Delete: `device/build/arm64/stage-routeguard/00-routeguard/files/rg-provision`
- Delete: `device/build/arm64/stage-routeguard/00-routeguard/files/rg-kiosk.sh`
- Delete: `device/build/arm64/stage-routeguard/00-routeguard/files/routeguard-provision.service`
- Delete: `device/build/arm64/stage-routeguard/00-routeguard/files/routeguard-kiosk.service`

The old stage installed local `files/` into the image. The new stage installs from
`/common/` (mounted into the Docker build context) and drops the old provision flow.

**Step 1: Rewrite 00-run.sh**

```bash
cat > device/build/arm64/stage-routeguard/00-routeguard/00-run.sh << 'EOF'
#!/bin/bash -e

on_chroot << CHROOT
apt-get install -y --no-install-recommends \
    chromium-browser \
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
EOF
chmod +x device/build/arm64/stage-routeguard/00-routeguard/00-run.sh
```

**Step 2: Remove old files directory**

```bash
git rm -r device/build/arm64/stage-routeguard/00-routeguard/files/
```

**Step 3: Update arm64/config to disable SSH and set correct stage list**

```bash
cat > device/build/arm64/config << 'EOF'
IMG_NAME="routeguard-arm64"
RELEASE=bookworm
DEPLOY_COMPRESSION=gz
ENABLE_SSH=0
FIRST_USER_NAME=routeguard
FIRST_USER_PASS=routeguard
STAGE_LIST="stage0 stage1 stage2 stage-routeguard"
EOF
```

**Step 4: Commit**

```bash
git add device/build/arm64/
git commit -m "feat: update ARM64 pi-gen stage for new check-in flow"
```

---

## Task 6: x86-64 Dockerfile

**Files:**
- Create: `device/build/x86-64/Dockerfile`

The x86-64 build runs `build.sh` inside a privileged Debian container with the tools
needed for debootstrap and disk image creation.

**Step 1: Create Dockerfile**

```bash
cat > device/build/x86-64/Dockerfile << 'EOF'
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

COPY build.sh /build.sh
COPY ../common /common
RUN chmod +x /build.sh

VOLUME ["/output"]

CMD ["/build.sh"]
EOF
```

**Step 2: Commit**

```bash
git add device/build/x86-64/Dockerfile
git commit -m "feat: add x86-64 build Dockerfile"
```

---

## Task 7: x86-64 build.sh

**Files:**
- Create: `device/build/x86-64/build.sh`

Produces a 4GB GPT disk image with an EFI partition and a Debian 12 root partition,
GRUB installed, all packages and common files baked in. Output: `/output/routeguard-latest.img.gz`.

**Step 1: Create build.sh**

```bash
cat > device/build/x86-64/build.sh << 'SCRIPT'
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
SCRIPT
chmod +x device/build/x86-64/build.sh
```

**Step 2: Test the build locally (optional, takes ~10 minutes)**

```bash
cd device/build/x86-64
mkdir -p output
docker build -t rg-build-x86 .
docker run --privileged -v $(pwd)/output:/output rg-build-x86
ls -lh output/
```

Expected: `output/routeguard-latest.img.gz` around 600-900MB.

**Step 3: Commit**

```bash
git add device/build/x86-64/build.sh
git commit -m "feat: add x86-64 debootstrap disk image build script"
```

---

## Task 8: device/README.md

**Files:**
- Create: `device/README.md`

**Step 1: Create README**

```bash
cat > device/README.md << 'EOF'
# RouteGuard Device Images

Pre-built Debian 12 images for RouteGuard hardware. On first boot the device
registers itself with the API, displays a claim code, and waits for an admin to
claim it via the dashboard.

## Download

Download the latest images from the dashboard at Admin -> Device Images, or directly
from RustFS:

- ARM64 (Raspberry Pi): `https://storage.route-guard.com/device-images/arm64/routeguard-latest.img.gz`
- x86-64 (laptops, VMs): `https://storage.route-guard.com/device-images/x86-64/routeguard-latest.img.gz`

## Flash to Raspberry Pi (ARM64)

**SD card or USB drive:**

```bash
# Decompress and write in one step (replace /dev/sdX with your device)
gunzip -c routeguard-latest.img.gz | sudo dd of=/dev/sdX bs=4M status=progress
sync
```

Or use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) - choose
"Use custom image" and select the `.img.gz` file directly.

## Flash to USB Drive (x86-64)

```bash
gunzip -c routeguard-latest.img.gz | sudo dd of=/dev/sdX bs=4M status=progress
sync
```

Or use [Balena Etcher](https://etcher.balena.io/) - it accepts `.img.gz` directly.

The image boots on any UEFI machine. Disable Secure Boot in your BIOS if it blocks
unsigned bootloaders.

## Boot in a VM (x86-64)

**QEMU:**

```bash
gunzip -k routeguard-latest.img.gz  # decompress, keep original
qemu-system-x86_64 \
    -m 1024 \
    -drive file=routeguard-latest.img,format=raw \
    -bios /usr/share/ovmf/OVMF.fd \
    -net nic -net user
```

**VirtualBox:** Create a new VM, use "Use an existing virtual hard disk file",
convert the image first: `VBoxManage convertfromraw routeguard-latest.img routeguard.vdi --format VDI`

## First Boot

1. The device connects to WiFi (SSID: `routeguard`, password: `routeguard`)
   or to any available wired ethernet.
2. A claim code (8 uppercase characters) appears on screen in large text.
3. In the dashboard go to **Devices -> Add Device** and enter the code.
4. Fill in the bus details. The device receives its token and launches the driver app.

## Custom WiFi

To connect to a different network before first boot, mount the boot partition and
create a NetworkManager connection file:

```bash
# Mount the EFI partition (first partition)
sudo mount /dev/sdX1 /mnt

# Create a connection file
sudo tee /mnt/custom.nmconnection << 'NMEOF'
[connection]
id=my-network
type=wifi
autoconnect=true

[wifi]
ssid=MyNetworkName
mode=infrastructure

[wifi-security]
key-mgmt=wpa-psk
psk=MyPassword

[ipv4]
method=auto

[ipv6]
method=auto
NMEOF
sudo chmod 600 /mnt/custom.nmconnection
sudo umount /mnt
```

The device will pick it up on first boot.

## Building Images Locally

**ARM64 (requires QEMU user-static for cross-compilation):**

```bash
cd device/build/arm64
docker build -t rg-build-arm64 .
mkdir -p output
docker run --privileged -v $(pwd)/output:/pi-gen/deploy rg-build-arm64
```

**x86-64:**

```bash
cd device/build/x86-64
docker build -t rg-build-x86 .
mkdir -p output
docker run --privileged -v $(pwd)/output:/output rg-build-x86
```
EOF
```

**Step 2: Commit**

```bash
git add device/README.md
git commit -m "docs: add device flashing and first-boot README"
```

---

## Task 9: GitHub Actions CI

**Files:**
- Create: `.github/workflows/device-images.yml`

Builds both images in parallel on pushes to main that touch `device/`. Uploads to
RustFS using `mc`. Requires these repository secrets set in GitHub:
- `RUSTFS_ENDPOINT` - e.g. `http://10.1.40.125:9000` (internal address from runner)
- `RUSTFS_ACCESS_KEY`
- `RUSTFS_SECRET_KEY`

**Step 1: Create workflow**

```bash
mkdir -p .github/workflows
cat > .github/workflows/device-images.yml << 'EOF'
name: Build Device Images

on:
  push:
    branches: [main]
    paths:
      - 'device/**'

jobs:
  build-arm64:
    name: Build ARM64 Image
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4

      - name: Build ARM64 image
        run: |
          cd device/build/arm64
          mkdir -p output
          docker build -t rg-build-arm64 .
          docker run --privileged \
            -v "$(pwd)/output:/pi-gen/deploy" \
            rg-build-arm64

      - name: Upload to RustFS
        run: |
          mc alias set rg "${{ secrets.RUSTFS_ENDPOINT }}" \
              "${{ secrets.RUSTFS_ACCESS_KEY }}" \
              "${{ secrets.RUSTFS_SECRET_KEY }}"
          mc cp device/build/arm64/output/*arm64*.img.gz \
              rg/device-images/arm64/routeguard-latest.img.gz

  build-x86-64:
    name: Build x86-64 Image
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4

      - name: Build x86-64 image
        run: |
          cd device/build/x86-64
          mkdir -p output
          docker build -t rg-build-x86 .
          docker run --privileged \
            -v "$(pwd)/output:/output" \
            rg-build-x86

      - name: Upload to RustFS
        run: |
          mc alias set rg "${{ secrets.RUSTFS_ENDPOINT }}" \
              "${{ secrets.RUSTFS_ACCESS_KEY }}" \
              "${{ secrets.RUSTFS_SECRET_KEY }}"
          mc cp device/build/x86-64/output/routeguard-latest.img.gz \
              rg/device-images/x86-64/routeguard-latest.img.gz
EOF
```

**Step 2: Add RUSTFS secrets to GitHub**

In the GitHub repo go to Settings -> Secrets and variables -> Actions and add:

- `RUSTFS_ENDPOINT`: the RustFS endpoint reachable from the self-hosted runner
  (e.g. `http://172.18.0.7:9000` if runner is on the same Docker network, or
  `http://10.1.40.125:9000` if accessing via LAN)
- `RUSTFS_ACCESS_KEY`: value from `/opt/routeguard/deploy/.env`
- `RUSTFS_SECRET_KEY`: value from `/opt/routeguard/deploy/.env`

**Step 3: Commit and push**

```bash
git add .github/workflows/device-images.yml
git commit -m "ci: add GitHub Actions workflow to build and upload device images"
git push origin main
```

**Step 4: Verify**

Push a trivial change to `device/README.md` and confirm both jobs appear in the
Actions tab and complete successfully. Check RustFS:

```bash
ssh -i deploy/keys/routeguard_deploy root@10.1.40.125 \
    'mc ls rg/device-images/arm64/ && mc ls rg/device-images/x86-64/'
```

Expected: both `routeguard-latest.img.gz` entries updated with today's timestamp.

---

## Final Verification Checklist

- [ ] `device/build/common/` contains: `rg-checkin`, `rg-kiosk.sh`, `routeguard-kiosk.service`, `routeguard.nmconnection`
- [ ] `device/build/arm64/` builds without error in Docker
- [ ] `device/build/x86-64/` builds and produces a `.img.gz` in Docker (`--privileged`)
- [ ] Smoke test: `rg-checkin` exits 0 immediately when `/etc/routeguard/token` exists
- [ ] `device/README.md` covers flash, VM boot, first-boot, custom WiFi, local build
- [ ] GitHub Actions workflow triggers on `device/**` changes only
- [ ] Both images uploaded to RustFS after a successful CI run
- [ ] Old `device/pi-gen/` directory fully removed from the repo
