# RouteGuard

Enterprise school bus fleet management platform.

## Structure

| Directory | Description |
|-----------|-------------|
| `dashboard/` | Next.js frontend (route-guard.com) |
| `routeguard-api/` | Go API backend (api.route-guard.com) |
| `deploy/` | Docker Compose, Traefik, deployment scripts |
| `device/` | Native Linux bus device app and appliance support files |
| `docs/` | Architecture and implementation plans |

## Quick Start

See `deploy/README.md` for full setup instructions.

## Server Authentication

The production infrastructure server is located at `10.1.40.125`. You can log in as `root` using the SSH key material in `deploy/keys`.

## Device Box Access

The Debian device box used for bus-device setup is located at `10.1.11.198`.

- User login:
  - username: `routeguard`
  - password: `routeguard`
- Root login:
  - password: `routeguard`
