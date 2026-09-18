#!/bin/bash
set -u
MM_URL="http://localhost:8080"

xrandr --output HDMI-1 --rotate normal

# touch-input coordinate matrix — set by mm-profile from the profile's display.conf (TOUCH=)
TID=$(xinput list 2>/dev/null | grep -i "MPI7002" | grep -oP "id=\K[0-9]+" | head -1)
[ -n "$TID" ] && xinput set-prop "$TID" "Coordinate Transformation Matrix" 1 0 0 0 1 0 0 0 1

openbox &

xset -dpms
xset s off
xset s noblank
unclutter -idle 0.5 -root &

until curl -sf -o /dev/null "$MM_URL"; do sleep 2; done

PREFS="$HOME/.config/chromium/Default/Preferences"
[ -f "$PREFS" ] && sed -i "s/\"exit_type\":\"[^\"]*\"/\"exit_type\":\"Normal\"/; s/\"exited_cleanly\":false/\"exited_cleanly\":true/" "$PREFS"

exec chromium \
  --kiosk --app="$MM_URL" \
  --window-size=1024,600 --window-position=0,0 --force-device-scale-factor=1 \
  --touch-events=enabled \
  --incognito --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --disable-features=Translate,TranslateUI \
  --check-for-update-interval=31536000 --overscroll-history-navigation=0 \
  --disable-pinch --autoplay-policy=no-user-gesture-required
