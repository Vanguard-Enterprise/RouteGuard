#!/bin/bash
# Start Chromium in kiosk mode pointing to the driver app
sleep 2  # Wait for X to be ready

ORG_URL=$(cat /home/routeguard/.config/org_url 2>/dev/null || echo "https://app.route-guard.com")

chromium-browser \
  --kiosk \
  --app="${ORG_URL}/driver" \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --disable-translate \
  --no-first-run \
  --noerrdialogs \
  --disable-features=TranslateUI \
  "${ORG_URL}/driver"
