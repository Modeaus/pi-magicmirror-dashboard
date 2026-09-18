/* config/secrets.example.js — TEMPLATE. Copy this to config/secrets.js and
 * fill in your own values. config/secrets.js is gitignored and never
 * committed — both profiles' config.js require() it and fall back to
 * harmless placeholders if it's missing.
 */
module.exports = {
	// Rough coordinates for the weather module (city-level precision is fine).
	LAT: 40.7128,
	LON: -74.006,

	// NWS grid for MMM-HourlyChart, format "OFFICE/X,Y". Look yours up at
	// https://api.weather.gov/points/{lat},{lon} (the "gridId"/"gridX"/"gridY"
	// fields in the response).
	NWS_GRID: "OKX/33,35",

	// Home Assistant. Create a long-lived access token under your HA user
	// profile (Settings -> your profile -> Security -> Long-Lived Access Tokens).
	HA_HOST: "homeassistant.local",
	HA_PORT: 8123,
	HA_TOKEN: "REPLACE_ME",

	// Plex. Token: https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/
	PLEX_HOST: "plex.local",
	PLEX_PORT: 32400,
	PLEX_TOKEN: "REPLACE_ME",

	// qBittorrent WebUI (MMM-QbitDownloads).
	QBIT_HOST: "qbittorrent.local",
	QBIT_PORT: 8080,

	// Devices allowed to load the MagicMirror server directly (mostly
	// relevant if you ever hit the server from something other than the
	// kiosk browser on localhost). Loopback + your LAN range is usually enough.
	LAN_CIDR: ["127.0.0.1", "::ffff:127.0.0.1", "::1", "192.168.0.0/16"],

	// Private iCal feed URLs (Google Calendar -> Settings -> [calendar] ->
	// "Secret address in iCal format"). Any subset is fine; missing keys are
	// just skipped in config.js.
	CALENDARS: {
		school: "",
		personal: "",
		family: "",
		holidays: "https://ics.calendarlabs.com/76/mm3137/US_Holidays.ics"
	}

	// Optional overrides — uncomment and edit if you want your own camera
	// list instead of the examples baked into config.js:
	// CAMERAS: [
	// 	{ entity: "camera.front_door", label: "Front Door" }
	// ],
	// CAMERA_MOTION: [
	// 	{ entity: "binary_sensor.front_door_motion", camera: "camera.front_door", label: "Front Door" }
	// ],
};
