# Device Image Build - Design

## Goal

Replace the existing pi-gen-only build with a two-pipeline system that produces flashable
Debian 12 images for both ARM64 (Raspberry Pi) and x86-64 (laptops, VMs). Both images share
the same application layer and implement the new check-in/claim provisioning flow.

## Directory Structure

```
device/
  README.md                        # flashing and first-boot instructions
  build/
    common/                        # shared across both architectures
      rg-checkin                   # check-in service binary/script
      rg-kiosk.sh                  # kiosk launcher
      routeguard-checkin.service   # systemd: runs check-in on first boot
      routeguard-kiosk.service     # systemd: launches Chromium kiosk
      routeguard.nmconnection      # NetworkManager WiFi config (routeguard/routeguard)
      claim-code.html              # local HTML page shown during claim wait
    arm64/                         # Raspberry Pi
      config                       # pi-gen config
      Dockerfile                   # pi-gen Docker build
      stage-routeguard/            # pi-gen stage (installs common/ files)
    x86-64/                        # laptops and VMs
      build.sh                     # debootstrap + disk image script
      Dockerfile                   # build container
      grub/                        # GRUB EFI config
```

## Base OS

**Debian 12 (Bookworm) for both architectures.**

- ARM64: Raspberry Pi OS (Debian 12 based) via pi-gen - best RPi hardware support
- x86-64: Debian 12 via debootstrap - clean, lightweight, Chromium as standard apt package

Non-free firmware included on both: `linux-firmware`, `firmware-realtek`,
`firmware-iwlwifi`, `firmware-mediatek` - covers ~95% of laptop WiFi chipsets.

## Packages

Installed on both images:

| Package | Purpose |
|---------|---------|
| `chromium` | Kiosk browser |
| `xorg`, `openbox` | Minimal display stack |
| `network-manager` | WiFi and ethernet management |
| `linux-firmware`, `firmware-realtek`, `firmware-iwlwifi`, `firmware-mediatek` | WiFi driver firmware |
| `unclutter` | Hide mouse cursor in kiosk |
| `curl` | Check-in HTTP calls |
| `ufw` | Firewall |
| `python3` | Serial number / config helpers |

## WiFi Configuration

A hardcoded NetworkManager connection file is baked into the image for development:

- SSID: `routeguard`
- Password: `routeguard`
- Auto-connect: yes

For production or different networks, drop a `.nmconnection` file onto the boot
partition before flashing. NetworkManager picks it up on first boot.

## First Boot Flow

1. Device boots, `routeguard-checkin.service` starts after `network-online.target`
2. `rg-checkin` reads the device serial:
   - RPi: `/proc/cpuinfo` (`Serial` field)
   - x86-64: `/sys/class/dmi/id/product_serial` (falls back to generating and
     persisting a UUID at `/etc/routeguard/serial` if empty)
3. Calls `POST /api/v1/devices/checkin` with the serial
4. On success, receives an 8-character claim code
5. Chromium opens `file:///usr/share/routeguard/claim-code.html` displaying the
   claim code in large text for the admin to read
6. `rg-checkin` polls `GET /api/v1/devices/checkin/status?serial=<serial>` every 5 seconds
7. Once claimed, receives the device token, stores it at `/etc/routeguard/token`
8. `routeguard-checkin.service` exits, `routeguard-kiosk.service` starts
9. Chromium relaunches in kiosk mode pointing at `https://app.route-guard.com/driver`
   with the token injected into localStorage

On subsequent boots, if `/etc/routeguard/token` exists, the check-in service is
skipped and kiosk mode launches directly.

## x86-64 Image Format

- GPT partition table
- EFI System Partition (FAT32, 256MB) with GRUB EFI bootloader
- Root partition (ext4) with Debian 12 Bookworm
- Flashable to USB or SSD via `dd` or Balena Etcher
- Boots on any UEFI machine

## Firewall

Same rules as current:

- Default deny all inbound and outbound
- Allow outbound UDP 53 (DNS)
- Allow outbound TCP 443 (HTTPS)

## Build Pipeline (CI)

GitHub Actions, self-hosted runner, triggered only when `device/**` changes:

1. ARM64 job: builds pi-gen Docker image, runs build, outputs `arm64/routeguard-latest.img.gz`
2. x86-64 job: runs `build.sh` in Docker, outputs `x86-64/routeguard-latest.img.gz`
3. Upload job: pushes both `.img.gz` files to RustFS `device-images/` bucket

Both jobs run in parallel. Upload job depends on both completing successfully.

## Documentation (device/README.md)

Covers:

- **Flash to RPi:** `dd` or Raspberry Pi Imager, SD card or USB boot
- **Flash to USB (x86-64):** `dd if=routeguard-latest.img.gz | gunzip | dd of=/dev/sdX` or Balena Etcher
- **Boot in VM:** QEMU one-liner using the x86-64 image
- **First boot:** what appears on screen, how to read the claim code, where to enter it in the dashboard
- **Custom WiFi:** how to drop a `.nmconnection` file onto the boot partition
