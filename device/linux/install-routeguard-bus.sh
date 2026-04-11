#!/usr/bin/env bash
set -euo pipefail

PACKAGE_URL=""
SHA256=""
VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package-url)
      PACKAGE_URL="${2:-}"
      shift 2
      ;;
    --sha256)
      SHA256="${2:-}"
      shift 2
      ;;
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${PACKAGE_URL}" || -z "${SHA256}" || -z "${VERSION}" ]]; then
  echo "Usage: install-routeguard-bus.sh --package-url <url> --sha256 <checksum> --version <version>" >&2
  exit 1
fi

if [[ ! -f /etc/debian_version ]]; then
  echo "RouteGuard device install requires a Debian-compatible system." >&2
  exit 1
fi

ARCH="$(dpkg --print-architecture)"
if [[ "${ARCH}" != "amd64" ]]; then
  echo "Unsupported architecture: ${ARCH}. RouteGuard currently supports amd64 only." >&2
  exit 1
fi

if [[ ! -s /etc/machine-id ]]; then
  echo "Missing /etc/machine-id. RouteGuard cannot install on a device without a stable machine identity." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
PACKAGE_PATH="${WORK_DIR}/routeguard-bus_${VERSION}_${ARCH}.deb"
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "Downloading RouteGuard Bus ${VERSION}..."
curl -fL "${PACKAGE_URL}" -o "${PACKAGE_PATH}"

ACTUAL_SHA="$(sha256sum "${PACKAGE_PATH}" | awk '{print $1}')"
if [[ "${ACTUAL_SHA}" != "${SHA256}" ]]; then
  echo "Checksum mismatch for ${PACKAGE_PATH}" >&2
  echo "Expected: ${SHA256}" >&2
  echo "Actual:   ${ACTUAL_SHA}" >&2
  exit 1
fi

echo "Installing package..."
apt-get update
apt-get install -y "${PACKAGE_PATH}"

if ! systemctl is-enabled routeguard-bus.service >/dev/null 2>&1; then
  echo "RouteGuard service was not enabled after install." >&2
  exit 1
fi

if ! systemctl is-active routeguard-bus.service >/dev/null 2>&1; then
  echo "RouteGuard service failed to start." >&2
  systemctl status routeguard-bus.service --no-pager || true
  exit 1
fi

echo "RouteGuard Bus ${VERSION} installed successfully."
echo "Open the device display and look for the enrollment screen."
