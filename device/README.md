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

## Runtime configuration

The app reads configuration from environment variables:

- `ROUTEGUARD_API_BASE`
- `ROUTEGUARD_DEVICE_ID`
- `ROUTEGUARD_APP_VERSION`

Device enrollment is now backend-driven:

- first boot shows a rotating enrollment code
- an org admin claims the device from dashboard settings
- the issued device token is persisted locally by the app

## Linux appliance notes

See `linux/routeguard-bus.service` for a systemd unit example and `linux/routeguard-bus.env.example` for environment configuration.
