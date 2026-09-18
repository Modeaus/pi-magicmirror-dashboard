# Pi MagicMirror Dashboard

A [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) build running
headless (`serveronly`) on a Raspberry Pi with a Chromium kiosk browser
driving a small touchscreen panel. Two swappable layouts — a 6-tab landscape
dashboard and a portrait "at-a-glance" view — plus a handful of custom
modules for Home Assistant, Plex, qBittorrent, and a couple of one-off
integrations.

## What's here

- **Landscape profile** (1024×600) — sidebar-driven tabs: Home (forecast +
  upcoming events + alert chips), Weather (12-hour chart), Calendar (month
  grid), Plex (now playing / recently watched / downloads), House (Home
  Assistant panel), News, and a camera wall reached from the House tab.
- **Portrait profile** (600×1024) — always-on glance view: clock, weather,
  a couple of live Home Assistant readouts, a day/week calendar toggle, and
  Plex now-playing.
- **Custom modules** (`modules/`) — Home Assistant light/sensor panels and
  touch toggles, a Plex now-playing/recently-watched pair, a qBittorrent
  downloads list, a camera wall with tap-to-fullscreen, a small top-bar
  status dot fed by an external webhook, a sidebar/pager combo, and a couple
  of smaller utility modules.
- **Kiosk plumbing** (`kiosk.sh`, `systemd/`) — `mm-serveronly.service` runs
  the MagicMirror Node server headless; `mm-kiosk.service` + `kiosk.sh` bring
  up an X session and a Chromium kiosk window pointed at it on boot, with
  touch-rotation handling.
- **`mm-profile`** — switches between the two layouts (copies the chosen
  profile's `config.js`/`custom.css` into place, applies its rotation/window
  size to `kiosk.sh`, restarts the server).

## Setup

1. Install MagicMirror² per [its own docs](https://docs.magicmirror.builders/),
   then drop this repo's `modules/*` into your MagicMirror's `modules/`
   directory and `config/profiles/*` into `config/profiles/`.
2. `cp config/secrets.example.js config/secrets.js` and fill in your own
   Home Assistant host/token, Plex host/token, qBittorrent host, weather
   coordinates, and calendar iCal URLs. This file is gitignored — never
   commit your real one.
3. Pick a profile: `./mm-profile landscape` or `./mm-profile portrait`. Edit
   `config/profiles/<name>/display.conf` first if your panel's resolution,
   rotation, or touch calibration differs from the defaults.
4. For each custom module under `modules/`, run `npm install` inside its
   directory if it has a `package.json`.
5. For always-on kiosk mode: copy `systemd/*.service` to
   `/etc/systemd/system/`, replace `REPLACE_WITH_YOUR_USER` with your
   username, `sudo systemctl enable --now mm-serveronly mm-kiosk`. This
   assumes an `agetty` auto-login on tty1 and X installed but not otherwise
   running — `kiosk.sh` starts X itself.

## Notes

- The example entity IDs, lights, sensors, and cameras baked into
  `config/profiles/*/config.js` are illustrative — swap them for your own
  Home Assistant entities.
- `MMM-ClaudeStatus` and `MMM-TrailCam` both expose small HTTP routes on
  MagicMirror's own built-in web server (no extra server needed) so an
  external script can push a status change or notification in with a plain
  `curl`. See each module's header comment for the exact routes.
