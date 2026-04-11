# RouteGuard Bus Device

Native Linux bus-computer application for RouteGuard.

## Scope

This directory contains the first production-oriented scaffold for the in-bus device:

- `Qt/QML` touchscreen application
- local `SQLite` queue for offline RFID scan persistence
- periodic device check-in to the RouteGuard API
- periodic sync of pending rider scan events
- duplicate scan suppression window to reduce repeat reads during boarding
- Linux appliance support files for systemd launch on a Debian-based bus computer

## Build

Install Qt 6 development packages on Debian, then:

```bash
cmake -S . -B build
cmake --build build
```

The resulting binary is `routeguard-bus`.

Production builds embed:

- API base URL: `https://api.route-guard.com`
- app version: from the CMake project version
- device identity: from `/etc/machine-id`

Developer builds can target another API by setting the CMake cache variable at configure time:

```bash
cmake -S . -B build -DROUTEGUARD_API_BASE=http://localhost:8080
```

## Debian package

Build the app first, then assemble the installable Debian package:

```bash
cmake -S . -B build
cmake --build build
./debian/build-deb.sh
```

This produces:

- `build/dist/routeguard-bus_<version>_amd64.deb`
- `build/dist/routeguard-bus_<version>_amd64.deb.sha256`

The one-line installer script lives at `linux/install-routeguard-bus.sh` and is designed to be hosted from RouteGuard-managed storage.

Device enrollment is now backend-driven:

- first boot shows a rotating enrollment code
- an org admin claims the device from dashboard settings
- the issued device token is persisted locally by the app
- if `/etc/machine-id` is missing or unreadable, the app stops in a visible device-error state instead of inventing a new ID

## Linux appliance notes

See `linux/routeguard-bus.service` for a systemd unit example. The service no longer needs an environment file for normal production use.

For kiosk-style appliance installs on hardware with multiple connected displays, the packaged `linux/eglfs-kms.json` file is the source of truth for connector selection. Production currently prefers the external `DP-2` output and disables the built-in `eDP-1` panel on the reference laptop hardware.
