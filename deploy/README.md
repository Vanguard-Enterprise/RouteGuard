# RouteGuard Deployment Guide

This guide covers deploying RouteGuard to an LXC container on a Proxmox host (or any Debian 12 VM).

---

## Prerequisites

**LXC container spec:**
- OS: Debian 12 (Bookworm)
- CPU: 4 vCPU
- RAM: 8 GB
- Disk: 40 GB
- Nesting enabled (required for Docker)

---

## Step 1: LXC container setup

SSH into the container as root and run the setup script:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/your-org/routeguard/main/deploy/scripts/setup-lxc.sh)
```

Or clone the repo first (see Step 2) and run:

```bash
chmod +x deploy/scripts/setup-lxc.sh
./deploy/scripts/setup-lxc.sh
```

Log out and back in for Docker group membership to take effect.

---

## Step 2: Clone the repository

```bash
git clone https://github.com/your-org/routeguard.git /opt/routeguard
cd /opt/routeguard
```

---

## Step 3: Configure environment variables

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Fill in all required variables:

| Variable | Description | Example |
|---|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL superuser password | `s3cur3-db-pass` |
| `REDIS_PASSWORD` | Redis AUTH password | `r3dis-pass` |
| `API_BASE_URL` | Public API base URL | `https://api.route-guard.com` |
| `SESSION_SECRET` | 32-byte hex string for session signing | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 32-byte hex string for AES-256-GCM | `openssl rand -hex 32` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | `ACxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | — |
| `TWILIO_FROM_NUMBER` | Twilio outbound number (E.164) | `+15551234567` |
| `MAPBOX_TOKEN` | Mapbox secret token (server-side) | `sk.eyJ1IjoidGVzdCJ9...` |
| `NEXT_PUBLIC_API_URL` | API URL accessible from browser | `https://api.route-guard.com` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox public token (client-side) | `pk.eyJ1IjoidGVzdCJ9...` |

Generate secrets:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
```

---

## Step 4: First deploy

```bash
cd /opt/routeguard/deploy
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

This will:
1. Pull latest Docker images
2. Start all services (`docker compose up -d`)
3. Run database migrations
4. Print the running service list

Verify the stack is healthy:

```bash
docker compose ps
docker compose logs routeguard-api --tail 50
```

---

## Step 5: SSL certificate setup (Let's Encrypt via Traefik)

Traefik handles TLS termination automatically via the ACME challenge. Ensure:

1. DNS A records for `api.route-guard.com` and `app.route-guard.com` point to your server's public IP.
2. Ports 80 and 443 are open (done by `setup-lxc.sh`).
3. Set `ACME_EMAIL` in `deploy/.env` to a valid email address.

Traefik will obtain and renew certificates automatically on first request.

Check certificate status:

```bash
docker compose logs traefik | grep -i acme
```

---

## Step 6: GitHub Actions runner registration

To enable CI/CD, register a self-hosted GitHub Actions runner in the container:

```bash
# Create a dedicated user for the runner
useradd -m -s /bin/bash github-runner
usermod -aG docker github-runner
su - github-runner

# Download and configure the runner (replace with your org/repo token)
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.314.1/actions-runner-linux-x64-2.314.1.tar.gz
tar xzf ./actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/your-org/routeguard --token YOUR_RUNNER_TOKEN
./run.sh
```

To install as a service:

```bash
sudo ./svc.sh install github-runner
sudo ./svc.sh start
```

---

## Updating

To deploy a new version:

```bash
cd /opt/routeguard
git pull
cd deploy
./scripts/deploy.sh
```

## Rollback

To roll back to a previous image tag, update `docker-compose.yml` image tags and re-run `deploy.sh`.
