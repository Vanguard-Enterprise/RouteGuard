#!/bin/bash
set -euo pipefail

# RouteGuard Device Setup
# Supported: Debian 12 (Bookworm) x86-64 or ARM64
# Run as root: curl https://api.route-guard.com/setup | sudo bash

API_URL="${RG_API_URL:-https://api.route-guard.com}"

# --- Preflight ---
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: must run as root" >&2
    exit 1
fi

. /etc/os-release 2>/dev/null || true
if [ "${ID:-}" != "debian" ] && [ "${ID_LIKE:-}" != "debian" ]; then
    echo "ERROR: requires Debian 12 (Bookworm)" >&2
    exit 1
fi

echo "==> RouteGuard device setup starting"
echo "    API: $API_URL"

# --- Packages ---
echo "==> Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y --no-install-recommends \
    chromium \
    xorg openbox x11-xserver-utils unclutter \
    network-manager \
    firmware-linux-free firmware-realtek firmware-iwlwifi \
    curl python3 \
    iptables iptables-persistent \
    openssh-server \
    systemd-sysv \
    locales

# --- System config ---
echo "==> Configuring system"
echo routeguard > /etc/hostname
grep -q "127.0.1.1 routeguard" /etc/hosts || echo "127.0.1.1 routeguard" >> /etc/hosts

echo "en_US.UTF-8 UTF-8" > /etc/locale.gen
locale-gen

id routeguard &>/dev/null || useradd -m -s /bin/bash routeguard
echo "routeguard:routeguard" | chpasswd

mkdir -p /etc/routeguard
mkdir -p /var/lib/routeguard/chromium
chown -R routeguard:routeguard /var/lib/routeguard

# --- Firewall ---
echo "==> Configuring firewall (skipped for now)"
# iptables -F
# iptables -X
# iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
# iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
# iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
# iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
# iptables -P INPUT DROP
# iptables -P FORWARD DROP
# iptables -P OUTPUT DROP
# netfilter-persistent save

# --- NetworkManager ---
# Remove all interface config so NetworkManager takes over wired networking
cat > /etc/network/interfaces << 'IFACES'
# Managed by NetworkManager
auto lo
iface lo inet loopback
IFACES
# Remove any per-interface files the Debian installer may have created
rm -f /etc/network/interfaces.d/*
# Create a wired connection profile so NM brings up Ethernet on boot
mkdir -p /etc/NetworkManager/system-connections
cat > /etc/NetworkManager/system-connections/wired.nmconnection << 'NMWIRED'
[connection]
id=wired
type=ethernet
autoconnect=true

[ethernet]

[ipv4]
method=auto

[ipv6]
method=auto
NMWIRED
chmod 600 /etc/NetworkManager/system-connections/wired.nmconnection
systemctl enable NetworkManager

# --- Install rg-checkin ---
cat > /usr/local/bin/rg-checkin << 'CHECKIN'
#!/bin/bash
set -e

API_URL="${RG_API_URL:-https://api.route-guard.com}"
TOKEN_FILE="/etc/routeguard/token"
SERIAL_FILE="/etc/routeguard/serial"

if [ -f "$TOKEN_FILE" ]; then
    exit 0
fi

get_serial() {
    local rpi_serial
    rpi_serial=$(grep "^Serial" /proc/cpuinfo 2>/dev/null | awk '{print $3}' | tr -d '[:space:]')
    if [ -n "$rpi_serial" ] && [ "$rpi_serial" != "0000000000000000" ]; then
        echo "$rpi_serial"; return
    fi

    local dmi_serial
    dmi_serial=$(cat /sys/class/dmi/id/product_serial 2>/dev/null | tr -d '[:space:]')
    if [ -n "$dmi_serial" ] \
        && [ "$dmi_serial" != "ToBeFilledByO.E.M." ] \
        && [ "$dmi_serial" != "Defaultstring" ] \
        && [ "$dmi_serial" != "None" ]; then
        echo "$dmi_serial"; return
    fi

    if [ -f "$SERIAL_FILE" ]; then cat "$SERIAL_FILE"; return; fi
    mkdir -p /etc/routeguard
    python3 -c "import uuid; print(str(uuid.uuid4()))" > "$SERIAL_FILE"
    cat "$SERIAL_FILE"
}

SERIAL=$(get_serial)
if [ -z "$SERIAL" ]; then
    echo "rg-checkin: ERROR: could not determine device serial" >&2
    exit 1
fi
echo "rg-checkin: serial=$SERIAL"

RESPONSE=$(curl -sf -X POST "$API_URL/api/v1/devices/checkin" \
    -H "Content-Type: application/json" \
    -d "{\"serial\": \"$SERIAL\"}" 2>&1) || {
    echo "rg-checkin: ERROR: checkin API call failed: $RESPONSE" >&2
    exit 1
}

CLAIM_CODE=$(echo "$RESPONSE" | python3 -c \
    "import json,sys; print(json.load(sys.stdin)['claim_code'])")

if [ -z "$CLAIM_CODE" ]; then
    echo "rg-checkin: ERROR: no claim_code in response" >&2
    exit 1
fi
echo "rg-checkin: claim_code=$CLAIM_CODE"

CLAIM_HTML="/tmp/rg-claim.html"
cat > "$CLAIM_HTML" << EOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>RouteGuard - Claim Device</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1B3A5C; color: white; font-family: sans-serif;
      display: flex; align-items: center; justify-content: center;
      height: 100vh; flex-direction: column; gap: 20px;
    }
    .label { font-size: 20px; opacity: 0.75; }
    .code { font-size: 80px; font-weight: bold; letter-spacing: 14px; color: #F5A825; font-family: monospace; }
    .hint { font-size: 15px; opacity: 0.55; text-align: center; max-width: 420px; }
  </style>
</head>
<body>
  <div class="label">Enter this code in the RouteGuard dashboard</div>
  <div class="code">$CLAIM_CODE</div>
  <div class="hint">Dashboard &rarr; Devices &rarr; Add Device</div>
</body>
</html>
EOF

chromium \
    --app="file://$CLAIM_HTML" \
    --no-first-run \
    --disable-infobars \
    --noerrdialogs \
    --no-sandbox \
    --test-type &
CHROMIUM_PID=$!

echo "rg-checkin: polling for claim..."
while true; do
    STATUS=$(curl -sf "$API_URL/api/v1/devices/checkin/status?serial=$SERIAL" 2>/dev/null || echo "")
    if [ -n "$STATUS" ]; then
        TOKEN=$(echo "$STATUS" | python3 -c \
            "import json,sys; d=json.load(sys.stdin); print(d.get('device_token',''))" 2>/dev/null || echo "")
        if [ -n "$TOKEN" ]; then
            echo "rg-checkin: device claimed, storing token"
            mkdir -p /etc/routeguard
            echo "$TOKEN" > "$TOKEN_FILE"
            chmod 600 "$TOKEN_FILE"
            kill "$CHROMIUM_PID" 2>/dev/null || true
            exit 0
        fi
    fi
    sleep 5
done
CHECKIN
chmod 755 /usr/local/bin/rg-checkin

# --- Install rg-kiosk.sh ---
cat > /usr/local/bin/rg-kiosk.sh << 'KIOSK'
#!/bin/bash
set -e

TOKEN_FILE="/etc/routeguard/token"
EXT_DIR="/etc/routeguard/extension"
APP_URL="https://app.route-guard.com/driver"
CHROMIUM_DATA="/var/lib/routeguard/chromium"

export DISPLAY=:0
if ! pidof Xorg > /dev/null 2>&1; then
    Xorg :0 vt1 -nolisten tcp &
    sleep 2
    openbox &
fi

until /usr/local/bin/rg-checkin; do
    echo "rg-kiosk: checkin failed, retrying in 10s..."
    sleep 10
done

TOKEN=$(cat "$TOKEN_FILE" | tr -d '[:space:]')

mkdir -p "$EXT_DIR"
cat > "$EXT_DIR/manifest.json" << 'MANIFEST'
{
  "name": "RouteGuard Bootstrap",
  "version": "1.0",
  "manifest_version": 3,
  "content_scripts": [{
    "matches": ["https://app.route-guard.com/*"],
    "js": ["bootstrap.js"],
    "run_at": "document_start",
    "world": "MAIN"
  }]
}
MANIFEST

cat > "$EXT_DIR/bootstrap.js" << EOF
(function () {
  var t = "${TOKEN}";
  if (t && !localStorage.getItem('device_token')) {
    localStorage.setItem('device_token', t);
  }
})();
EOF

mkdir -p "$CHROMIUM_DATA"

exec chromium \
    --kiosk \
    --app="$APP_URL" \
    --load-extension="$EXT_DIR" \
    --disable-extensions-except="$EXT_DIR" \
    --user-data-dir="$CHROMIUM_DATA" \
    --no-first-run \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-translate \
    --noerrdialogs \
    --no-sandbox \
    --test-type \
    --disable-features=TranslateUI
KIOSK
chmod 755 /usr/local/bin/rg-kiosk.sh

# --- Install systemd service ---
cat > /etc/systemd/system/routeguard-kiosk.service << 'SERVICE'
[Unit]
Description=RouteGuard Kiosk
After=network-online.target
Wants=network-online.target

[Service]
User=root
ExecStart=/usr/local/bin/rg-kiosk.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

# --- Install WiFi profile ---
mkdir -p /etc/NetworkManager/system-connections
cat > /etc/NetworkManager/system-connections/routeguard.nmconnection << 'NMCONN'
[connection]
id=routeguard
type=wifi
autoconnect=true

[wifi]
ssid=routeguard
mode=infrastructure

[wifi-security]
key-mgmt=wpa-psk
psk=routeguard

[ipv4]
method=auto

[ipv6]
method=auto
NMCONN
chmod 600 /etc/NetworkManager/system-connections/routeguard.nmconnection

# --- Enable services ---
systemctl daemon-reload
systemctl enable routeguard-kiosk.service

echo ""
echo "==> RouteGuard setup complete."
echo "    Reboot to start the kiosk: sudo reboot"
