# Setup Script CI

## Goal

Automatically test and deploy `routeguard-api/internal/api/scripts/setup.sh` whenever it changes, so the live `/setup` endpoint always reflects the latest version without a manual server deploy.

## Problem

Currently `setup.sh` is embedded in the Go binary via `go:embed` (or served directly). Changes require a full API redeploy triggered manually. There is no automated test to catch regressions (e.g., missing packages, bad package names for Ubuntu vs Debian).

## Plan

### 1. GitHub Actions workflow: test setup script

File: `.github/workflows/setup-script.yml`

Trigger: any push or PR that touches `routeguard-api/internal/api/scripts/setup.sh`.

Steps:
- Spin up a fresh `ubuntu:24.04` container
- Run the setup script (with `RG_API_URL` pointed at a mock or skipped)
- Assert that the installed binaries exist: `chromium-browser` or `chromium`, `openbox`, `NetworkManager`, `rg-checkin`, `rg-kiosk.sh`
- Assert that the systemd unit file is in place
- Exit non-zero on any failure

This catches broken package names, bad shell syntax, and missing installs before they reach production.

### 2. Auto-deploy on merge to main

The existing self-hosted runner on the LXC already handles API deploys via `.github/workflows/deploy.yml`. Extend it (or add a separate step) to re-deploy the API whenever `setup.sh` changes, so the `/setup` endpoint is updated automatically.

No extra work needed if the API binary already embeds `setup.sh` via `go:embed` - a normal API deploy picks it up. Confirm this is the case and document it.

### 3. Package name compatibility

The script currently tries `chromium-browser chromium` (both names) so either Debian or Ubuntu resolves correctly. Add a comment in the script explaining this. Consider also checking at runtime which binary is available and symlinking if needed.

## Files to touch

- `.github/workflows/setup-script.yml` - new CI workflow
- `routeguard-api/internal/api/scripts/setup.sh` - already patched for Ubuntu firmware packages
- Optionally `.github/workflows/deploy.yml` - confirm setup.sh changes trigger a redeploy

## Notes

- The setup script runs as root on the target machine - the CI container must also run as root (default for Docker containers without a USER directive).
- Use `act` locally to test the workflow before pushing if possible.
- The Ubuntu test matrix should cover 22.04 and 24.04.
