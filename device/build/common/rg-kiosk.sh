#!/bin/bash
set -e

TOKEN_FILE="/etc/routeguard/token"
EXT_DIR="/etc/routeguard/extension"
APP_URL="https://app.route-guard.com/driver"
CHROMIUM_DATA="/var/lib/routeguard/chromium"

# Start X display on VT1
Xorg :0 vt1 -nolisten tcp &
XORG_PID=$!
export DISPLAY=:0
sleep 2  # give X time to initialise

# Start openbox window manager
openbox &

# Run check-in if this device is not yet claimed
/usr/local/bin/rg-checkin

# Read token
TOKEN=$(cat "$TOKEN_FILE" | tr -d '[:space:]')

# Write bootstrap extension - injects device_token into the app's localStorage
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
    --disable-features=TranslateUI \
    --no-sandbox \
    --use-angle=swiftshader \
    --ignore-gpu-blocklist
