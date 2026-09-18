/* MagicMirror² — wall panel, PORTRAIT (600 x 1024)
 * serveronly + Chromium kiosk on a Pi 3B. Rotation + touch-matrix in kiosk.sh.
 * MM 2.37: default modules in defaultmodules/; add-ons in modules/.
 * Custom CSS lives at config/custom.css (NOT css/custom.css).
 *
 * NOTE: the entity IDs below are EXAMPLES — replace them with your own Home
 * Assistant entities. Connection details (hosts, tokens, coordinates) come
 * from config/secrets.js, which is gitignored; see config/secrets.example.js.
 */
let S = {};
{
	const path = require("node:path");
	const tries = [
		path.resolve(process.cwd(), "config", "secrets.js"),
		path.resolve(process.cwd(), "secrets.js"),
		"./secrets.js"
	];
	for (const p of tries) { try { S = require(p); break; } catch (e) { /* next */ } }
	if (!S.HA_TOKEN) console.warn("[config] no secrets.js found — using placeholders (copy config/secrets.example.js to config/secrets.js)");
}

const HA_HOST = S.HA_HOST || "homeassistant.local";
const HA_PORT = S.HA_PORT || 8123;
const HA_TOKEN = S.HA_TOKEN || "REPLACE_ME";
const PLEX_HOST = S.PLEX_HOST || "plex.local";
const PLEX_PORT = S.PLEX_PORT || 32400;
const PLEX_TOKEN = S.PLEX_TOKEN || "REPLACE_ME";
const LAT = S.LAT ?? 40.7128;
const LON = S.LON ?? -74.006;
const LAN_CIDR = S.LAN_CIDR || ["127.0.0.1", "::ffff:127.0.0.1", "::1", "192.168.0.0/16"];
const CAL = S.CALENDARS || {};

// shared calendar list (used by both the 2-day and week calendar instances)
const CALENDARS = [
	{ symbol: "school", color: "#66bb6a", url: CAL.school },
	{ symbol: "account", color: "#ffb74d", url: CAL.personal },
	{ symbol: "account-group", color: "#ce93d8", url: CAL.family },
	{ symbol: "flag-usa", color: "#7fb2ff", url: CAL.holidays, fetchInterval: 7 * 24 * 60 * 60 * 1000 },
].filter((c) => c.url);

let config = {
	address: "0.0.0.0",
	port: 8080,
	basePath: "/",
	ipWhitelist: LAN_CIDR,

	useHttps: false,
	language: "en",
	locale: "en-US",
	timeFormat: 24,
	units: "imperial",

	logLevel: ["INFO", "WARN", "ERROR"],

	modules: [
		{ module: "alert" },
		{ module: "MMM-WeatherWallpaper" },
		{ module: "MMM-ClaudeStatus", position: "top_bar" },
		{ module: "updatenotification", position: "top_bar" },

		// --- TOP ROW: clock + current temp side by side (flexed in custom.css) ---
		{
			module: "clock",
			position: "top_center",
			config: {
				displaySeconds: false,
				showWeek: true,
				dateFormat: "ddd, MMM D",
			},
		},
		{
			module: "weather",
			position: "top_center",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: LAT,
				lon: LON,
				onlyTemp: true,
				colored: true,
				appendLocationNameToHeader: false,
			},
		},

		// --- forecast directly beneath the clock row ---
		{
			module: "weather",
			position: "upper_third",
			header: "Forecast",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: LAT,
				lon: LON,
				appendLocationNameToHeader: false,
				maxNumberOfDays: 5,
				tableClass: "small",
				colored: true,
				fade: false,
			},
		},

		// --- Home Assistant (live) ---
		{
			module: "MMM-homeassistant-sensors",
			position: "middle_center",
			config: {
				host: HA_HOST,
				port: String(HA_PORT),
				https: false,
				token: HA_TOKEN,
				title: "",
				updateInterval: 60000,
				displaySymbol: true,
				rowClass: "small",
				values: [
					{ sensor: "climate.living_room", name: "Living Rm", attribute: "current_temperature", defunit: "°", displayunit: true, icons: [{ default: "sofa" }] },
					{ sensor: "sensor.bedroom_temperature", name: "Bedroom", defunit: "°", displayunit: true, icons: [{ default: "bed" }] },
					{ sensor: "binary_sensor.garage_door_status", name: "Garage", displayvalue: true, replace: [{ on: "OPEN", off: "Closed" }], icons: [{ on: "garage-alert-variant", off: "garage", default: "garage" }] },
				],
			},
		},
		{
			module: "MMM-HomeAssistant-Touch",
			position: "middle_center",
			config: {
				host: "http://" + HA_HOST,
				port: HA_PORT,
				ignoreCert: false,
				token: HA_TOKEN,
				entities: [
					"light.living_room",
					"light.office",
					"switch.porch_light",
				],
			},
		},

		// --- calendar: today-only + week views, toggled by MMM-CalToggle ---
		{ module: "MMM-CalToggle", position: "lower_third" },
		{
			module: "calendar",
			classes: "calview-day",
			position: "lower_third",
			config: {
				maximumNumberOfDays: 1,
				maximumEntries: 10,
				fade: false,
				coloredSymbol: true,
				coloredText: true,
				coloredBorder: true,
				calendars: CALENDARS,
			},
		},
		{
			module: "calendar",
			classes: "calview-week",
			position: "lower_third",
			config: {
				maximumNumberOfDays: 7,
				maximumEntries: 16,
				fade: false,
				coloredSymbol: true,
				coloredText: true,
				coloredBorder: true,
				calendars: CALENDARS,
			},
		},

		// --- Plex now-playing ---
		{
			module: "MMM-PlexNowPlaying",
			position: "bottom_bar",
			header: "Plex",
			config: {
				serverProtocol: "http",
				serverAddress: PLEX_HOST,
				serverPort: PLEX_PORT,
				xPlexToken: PLEX_TOKEN,
				updateInterval: 30,
				showUser: true,
				showPoster: false,
				hideWhenNothingPlaying: true,
			},
		},
	],
};

if (typeof module !== "undefined") {
	module.exports = config;
}
