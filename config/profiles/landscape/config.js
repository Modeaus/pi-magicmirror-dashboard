/* MagicMirror² — wall panel, LANDSCAPE (1024 x 600), tabbed dashboards.
 * Left sidebar (MMM-Sidebar) switches pages via MMM-pages; top bar (clock +
 * current weather + Claude dot) is fixed on every page; auto-returns to Home
 * after 60s idle. Custom CSS: config/custom.css.
 *
 * Tabs / page index:  0 Home · 1 Weather · 2 Calendar · 3 Plex · 4 House · 5 News
 *   + page 6 Cameras — no sidebar tab; reached from the House page's "Cameras"
 *     tile. Grid of HA camera snapshots; tap one to fill the screen, tap to close.
 * Page 3 (Plex) is a two-column split: recently-watched (left) + qBittorrent
 * downloads (right); MMM-PlexNowPlaying takes the left column while playing.
 *
 * NOTE: the entity IDs, lights, sensors, and cameras below are EXAMPLES —
 * replace them with your own Home Assistant entities. Connection details
 * (hosts, tokens, coordinates) come from config/secrets.js, which is
 * gitignored; see config/secrets.example.js for the template.
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

const HA_HOST   = S.HA_HOST   || "homeassistant.local";
const HA_PORT   = S.HA_PORT   || 8123;
const HA_TOKEN  = S.HA_TOKEN  || "REPLACE_ME";
const PLEX_HOST = S.PLEX_HOST || "plex.local";
const PLEX_PORT = S.PLEX_PORT || 32400;
const PLEX_TOKEN = S.PLEX_TOKEN || "REPLACE_ME";
const QBIT_HOST = S.QBIT_HOST || "qbittorrent.local";
const QBIT_PORT = S.QBIT_PORT || 8080;
const LAT = S.LAT ?? 40.7128;
const LON = S.LON ?? -74.006;
const NWS_GRID = S.NWS_GRID || "OKX/33,35";
const LAN_CIDR = S.LAN_CIDR || ["127.0.0.1", "::ffff:127.0.0.1", "::1", "192.168.0.0/16"];
const CAL = S.CALENDARS || {};

const WEATHER_PAGE = 1;
const CAL_PAGE = 2;
const CAMERAS_PAGE = 6;

// HA camera entities for the Cameras page (page 6). Offline ones show a placeholder.
const CAMERAS = S.CAMERAS || [
	{ entity: "camera.front_door", label: "Front Door" },
	{ entity: "camera.driveway", label: "Driveway" },
	{ entity: "camera.backyard", label: "Backyard" },
	{ entity: "camera.side_gate", label: "Side Gate" }
];

// motion binary_sensor -> camera. An "on" sensor puts a tappable "<label> Motion"
// chip in the Home notification strip; tapping it opens that camera fullscreen.
const CAMERA_MOTION = S.CAMERA_MOTION || [
	{ entity: "binary_sensor.front_door_motion", camera: "camera.front_door", label: "Front Door" },
	{ entity: "binary_sensor.driveway_motion", camera: "camera.driveway", label: "Driveway" }
];

const CALENDARS = [
	{ symbol: "school", color: "#66bb6a", url: CAL.school },
	{ symbol: "account", color: "#ffb74d", url: CAL.personal },
	{ symbol: "account-group", color: "#ce93d8", url: CAL.family },
	{ symbol: "flag-usa", color: "#7fb2ff", url: CAL.holidays, fetchInterval: 7 * 24 * 60 * 60 * 1000 }
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
		{ module: "MMM-ClaudeStatus", position: "top_bar" },

		// ---- pager + sidebar ----
		{
			module: "MMM-pages",
			config: {
				modules: [
					["page-home"],
					["page-weather"],
					["page-cal"],
					["page-plex"],
					["page-ha"],
					["page-news"],
					["page-cameras"]
				],
				fixed: ["fixed-top", "MMM-Sidebar", "MMM-ClaudeStatus", "alert"],
				timings: { default: 0 },
				homePage: 0,
				animationTime: 350
			}
		},
		{
			module: "MMM-Sidebar",
			position: "top_left",
			config: {
				homePage: 0,
				idleReturnMs: 60000,
				pollMs: 15000,
				tabs: [
					{ label: "Home", icon: "home-outline", page: 0 },
					{ label: "Weather", icon: "weather-partly-cloudy", page: 1 },
					{ label: "Cal", icon: "calendar-month", page: 2 },
					{ label: "Plex", icon: "plex", page: 3, state: "plex" },
					{ label: "House", icon: "lightbulb-group", page: 4, state: "ha" },
					{ label: "News", icon: "newspaper-variant-outline", page: 5 }
				],
				navTargets: [
					{ selector: ".module.weather.fixed-top", page: WEATHER_PAGE },
					{ selector: ".module.weather.page-home", page: WEATHER_PAGE },
					{ selector: ".module.calendar.page-home", page: CAL_PAGE }
				],
				plex: { host: PLEX_HOST, port: PLEX_PORT, token: PLEX_TOKEN },
				ha: { host: HA_HOST, port: HA_PORT, token: HA_TOKEN,
				      lights: ["light.living_room", "light.office", "switch.porch_light",
				               "switch.garage_lights"],
				      alerts: ["binary_sensor.garage_door_status"],
				      // drives the Home-screen notification chips (MMM-HomeNotifications)
				      alertEntities: [
				          { entity: "binary_sensor.garage_door_status", label: "Garage Open",
				            icon: "garage-open-variant", level: "warn", pulse: true, redAfterHour: 20 },
				          { entity: "binary_sensor.water_leak_sensor", label: "Water Leak",
				            icon: "water-alert", level: "critical", pulse: true }
				      ],
				      // camera motion -> tappable "… Motion" chip that opens the camera fullscreen
				      cameraMotion: CAMERA_MOTION,
				      motionHoldMs: 90000 }
			}
		},

		// ---- fixed top bar: local clock · GMT clock · current temp ----
		{
			module: "clock",
			classes: "fixed-top clock-local",
			position: "top_center",
			config: { displaySeconds: false, showWeek: false, dateFormat: "ddd, MMM D" }
		},
		{
			module: "clock",
			classes: "fixed-top clock-gmt",
			position: "top_center",
			config: {
				displaySeconds: false, showWeek: false, showDate: false,
				timezone: "UTC", timeFormat: 24
			}
		},
		{
			module: "weather",
			classes: "fixed-top",
			position: "top_center",
			config: {
				weatherProvider: "weathergov", type: "current",
				lat: LAT, lon: LON,
				onlyTemp: true, colored: true, appendLocationNameToHeader: false
			}
		},

		// ---- PAGE 0: Home (forecast summary + next events) ----
		{
			module: "weather",
			classes: "page-home",
			position: "middle_center",
			header: "Forecast · tap for hourly",
			config: {
				weatherProvider: "weathergov", type: "forecast",
				lat: LAT, lon: LON,
				appendLocationNameToHeader: false, maxNumberOfDays: 7,
				colored: true, fade: false, tableClass: "large"
			}
		},
		{
			// also the CALENDAR_EVENTS broadcast source for MMM-MonthlyCalendar
			module: "calendar",
			classes: "page-home",
			position: "middle_center",
			header: "Coming Up",
			config: {
				maximumEntries: 6, maximumNumberOfDays: 10, fade: false,
				broadcastEvents: true,
				coloredSymbol: true, coloredText: true, calendars: CALENDARS
			}
		},
		{
			// bottom-of-home notification chips (garage open, water leak, camera motion, …)
			module: "MMM-HomeNotifications",
			classes: "page-home page-home-notif",
			position: "middle_center",
			config: { title: "Notifications", camerasPage: CAMERAS_PAGE }
		},

		// ---- PAGE 1: Weather (hourly chart) ----
		{
			module: "MMM-HourlyChart",
			classes: "page-weather",
			position: "middle_center",
			header: "Next 12 Hours",
			config: { grid: NWS_GRID, hours: 12, updateMinutes: 20 }
		},

		// ---- PAGE 2: Calendar (month grid) ----
		{
			module: "MMM-MonthlyCalendar",
			classes: "page-cal",
			position: "middle_center",
			config: {
				mode: "currentMonth",
				firstDayOfWeek: "sunday",
				displaySymbol: true,
				wrapTitles: false
			}
		},

		// ---- PAGE 3: Plex (now playing / recently watched) ----
		{
			module: "MMM-PlexNowPlaying",
			classes: "page-plex plex-col-left",
			position: "middle_center",
			header: "Now Playing",
			config: {
				serverProtocol: "http", serverAddress: PLEX_HOST, serverPort: PLEX_PORT,
				xPlexToken: PLEX_TOKEN, updateInterval: 20,
				showUser: true, showPoster: true, hideWhenNothingPlaying: true
			}
		},
		{
			module: "MMM-PlexRecent",
			classes: "page-plex plex-col-left",
			position: "middle_center",
			header: "Recently Watched",
			config: {
				serverProtocol: "http", serverAddress: PLEX_HOST, serverPort: PLEX_PORT,
				xPlexToken: PLEX_TOKEN, count: 7, updateMinutes: 5
			}
		},
		{
			module: "MMM-QbitDownloads",
			classes: "page-plex plex-col-right",
			position: "middle_center",
			header: "Downloads",
			config: {
				protocol: "http", host: QBIT_HOST, port: QBIT_PORT,
				updateInterval: 15,
				activeMax: 4, recentMax: 5, recentDays: 10
			}
		},

		// ---- PAGE 4: House (Home Assistant) ----
		{
			module: "MMM-HAPanel",
			classes: "page-ha",
			position: "middle_center",
			config: {
				host: HA_HOST, port: HA_PORT, token: HA_TOKEN,
				updateInterval: 20000,
				lights: [
					{ entity: "light.living_room", label: "Living Rm" },
					{ entity: "light.office", label: "Office" },
					{ entity: "switch.porch_light", label: "Porch" },
					{ entity: "switch.garage_lights", label: "Garage" }
				],
				garage: {
					state: "binary_sensor.garage_door_status",
					relay: "switch.garage_door_relay",
					label: "Garage Door",
					redAfterHour: 20
				},
				sensors: [
					{ entity: "sensor.living_room_temperature", label: "Living Rm", unit: "°" },
					{ entity: "sensor.bedroom_temperature", label: "Bedroom", unit: "°" },
					{ entity: "sensor.living_room_humidity", label: "Humidity", unit: "%" },
					{ entity: "binary_sensor.water_leak_sensor", label: "Water Leak", on: "WET", off: "Dry" },
					{ entity: "binary_sensor.living_room_motion", label: "Living Rm Motion", on: "Motion", off: "Clear" }
				],
				camerasPage: CAMERAS_PAGE
			}
		},

		// ---- PAGE 6: Cameras (reached from the House page) ----
		{
			module: "MMM-CameraWall",
			classes: "page-cameras",
			position: "middle_center",
			config: {
				host: HA_HOST, port: HA_PORT, token: HA_TOKEN,
				cameras: CAMERAS,
				myPage: CAMERAS_PAGE,
				homePage: 0,
				idleReturnMs: 60000
			}
		},

		// ---- PAGE 5: News (general / tech / gaming) ----
		{
			module: "newsfeed",
			classes: "page-news news-general",
			position: "middle_center",
			header: "US & World",
			config: {
				feeds: [
					{ title: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
					{ title: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" }
				],
				showAsList: true, showDescription: false, showSourceTitle: true,
				showPublishDate: true, wordsPerMinute: 0,
				broadcastNewsFeeds: false, broadcastNewsUpdates: false,
				maxNewsItems: 4
			}
		},
		{
			module: "newsfeed",
			classes: "page-news news-tech",
			position: "middle_center",
			header: "Tech",
			config: {
				feeds: [
					{ title: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
					{ title: "The Verge", url: "https://www.theverge.com/rss/index.xml" }
				],
				showAsList: true, showDescription: false, showSourceTitle: true,
				showPublishDate: true, wordsPerMinute: 0,
				broadcastNewsFeeds: false, broadcastNewsUpdates: false,
				maxNewsItems: 4
			}
		},
		{
			module: "newsfeed",
			classes: "page-news news-gaming",
			position: "middle_center",
			header: "Gaming",
			config: {
				feeds: [
					{ title: "Polygon", url: "https://www.polygon.com/rss/index.xml" },
					{ title: "Kotaku", url: "https://kotaku.com/rss" },
					{ title: "IGN", url: "https://feeds.ign.com/ign/all" }
				],
				showAsList: true, showDescription: false, showSourceTitle: true,
				showPublishDate: true, wordsPerMinute: 0,
				broadcastNewsFeeds: false, broadcastNewsUpdates: false,
				maxNewsItems: 4
			}
		}
	]
};

if (typeof module !== "undefined") {
	module.exports = config;
}
