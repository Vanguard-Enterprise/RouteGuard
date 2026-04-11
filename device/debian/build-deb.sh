#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build"
PACKAGE_DIR="${ROOT_DIR}/build/package"
OUTPUT_DIR="${ROOT_DIR}/build/dist"
ARCH="${ROUTEGUARD_DEB_ARCH:-amd64}"
VERSION="${ROUTEGUARD_BUILD_VERSION_OVERRIDE:-$(sed -n 's/^project(routeguard-bus VERSION \([^ ]*\) LANGUAGES CXX)$/\1/p' "${ROOT_DIR}/CMakeLists.txt")}"

if [[ -z "${VERSION}" ]]; then
  echo "Could not determine RouteGuard device version from CMakeLists.txt" >&2
  exit 1
fi

if [[ ! -x "${BUILD_DIR}/routeguard-bus" ]]; then
  echo "Missing compiled binary at ${BUILD_DIR}/routeguard-bus. Build the app first." >&2
  exit 1
fi

rm -rf "${PACKAGE_DIR}" "${OUTPUT_DIR}"
mkdir -p \
  "${PACKAGE_DIR}/DEBIAN" \
  "${PACKAGE_DIR}/opt/routeguard-bus" \
  "${PACKAGE_DIR}/etc/systemd/system" \
  "${OUTPUT_DIR}"

sed \
  -e "s/@VERSION@/${VERSION}/g" \
  -e "s/@ARCH@/${ARCH}/g" \
  "${ROOT_DIR}/debian/control" > "${PACKAGE_DIR}/DEBIAN/control"

install -m 0755 "${ROOT_DIR}/debian/postinst" "${PACKAGE_DIR}/DEBIAN/postinst"
install -m 0755 "${BUILD_DIR}/routeguard-bus" "${PACKAGE_DIR}/opt/routeguard-bus/routeguard-bus"
install -m 0644 "${ROOT_DIR}/linux/eglfs-kms.json" "${PACKAGE_DIR}/opt/routeguard-bus/eglfs-kms.json"
install -m 0644 "${ROOT_DIR}/linux/routeguard-bus.service" "${PACKAGE_DIR}/etc/systemd/system/routeguard-bus.service"

dpkg-deb --build "${PACKAGE_DIR}" "${OUTPUT_DIR}/routeguard-bus_${VERSION}_${ARCH}.deb"
sha256sum "${OUTPUT_DIR}/routeguard-bus_${VERSION}_${ARCH}.deb" > "${OUTPUT_DIR}/routeguard-bus_${VERSION}_${ARCH}.deb.sha256"

echo "Built package:"
echo "  ${OUTPUT_DIR}/routeguard-bus_${VERSION}_${ARCH}.deb"
echo "Checksum:"
cat "${OUTPUT_DIR}/routeguard-bus_${VERSION}_${ARCH}.deb.sha256"
