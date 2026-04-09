# RouteGuard

Enterprise school bus fleet management platform.

## Structure

| Directory | Description |
|-----------|-------------|
| `dashboard/` | Next.js frontend (route-guard.com) |
| `routeguard-api/` | Go API backend (api.route-guard.com) |
| `deploy/` | Docker Compose, Traefik, deployment scripts |
| `device/` | Raspberry Pi OS image build (pi-gen) |
| `docs/` | Architecture and implementation plans |

## Quick Start

See `deploy/README.md` for full setup instructions.

##Server Authentication
The server running our infrastructure is located at 10.1.40.125. You can login using the deploy/keys and the root user.