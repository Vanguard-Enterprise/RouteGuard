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

Both pipelines use `device/build/` as the Docker build context so that the shared
`common/` layer is accessible to both Dockerfiles.

**ARM64 (requires QEMU user-static for cross-compilation):**

```bash
cd device/build
mkdir -p arm64/output
docker build -t rg-build-arm64 -f arm64/Dockerfile .
docker run --privileged -v "$(pwd)/arm64/output:/pi-gen/deploy" rg-build-arm64
```

**x86-64:**

```bash
cd device/build
mkdir -p x86-64/output
docker build -t rg-build-x86 -f x86-64/Dockerfile .
docker run --privileged -v "$(pwd)/x86-64/output:/output" rg-build-x86
```
