/* Registers GET /claude-status/:state on MagicMirror's web server and relays the
 * state to the front-end module. Also exposes /claude-status (no arg) -> current.
 * Separately polls the SoC temperature and pushes CLAUDE_PI_TEMP to the module,
 * and polls the wifi signal level and pushes CLAUDE_WIFI_SIGNAL. */
const NodeHelper = require("node_helper");
const fs = require("fs");

const TEMP_PATH = "/sys/class/thermal/thermal_zone0/temp";
const TEMP_INTERVAL = 15000; // ms

const WIRELESS_PATH = "/proc/net/wireless";
const WIFI_IFACE = "wlan0";
const WIFI_INTERVAL = 15000; // ms

module.exports = NodeHelper.create({
	start() {
		this.current = "idle";
		this.piTemp = null;
		this.wifiSignal = null;

		this.expressApp.get("/claude-status/:state", (req, res) => {
			const s = String(req.params.state || "").toLowerCase();
			const state = ["idle", "working", "waiting"].includes(s) ? s : "idle";
			this.current = state;
			this.sendSocketNotification("CLAUDE_STATE", state);
			res.set("Cache-Control", "no-store");
			res.type("text/plain").send("ok:" + state);
		});

		this.expressApp.get("/claude-status", (req, res) => {
			res.type("text/plain").send(this.current);
		});

		this.pollTemp();
		this._tempTimer = setInterval(() => this.pollTemp(), TEMP_INTERVAL);

		this.pollWifi();
		this._wifiTimer = setInterval(() => this.pollWifi(), WIFI_INTERVAL);

		console.log("[MMM-ClaudeStatus] listening on /claude-status/:state");
	},

	pollTemp() {
		fs.readFile(TEMP_PATH, "utf8", (err, data) => {
			if (err) return;
			const c = parseInt(data, 10) / 1000;
			if (Number.isNaN(c)) return;
			this.piTemp = Math.round(c * 10) / 10;
			this.sendSocketNotification("CLAUDE_PI_TEMP", this.piTemp);
		});
	},

	// /proc/net/wireless format, e.g.:
	//  wlan0: 0000   61.  -49.  -256        0      0      0      0      0        0
	// columns after the status word are: link, level (dBm), noise
	pollWifi() {
		fs.readFile(WIRELESS_PATH, "utf8", (err, data) => {
			if (err) return;
			const line = data.split("\n").find((l) => l.trim().startsWith(WIFI_IFACE + ":"));
			if (!line) {
				this.wifiSignal = null;
				this.sendSocketNotification("CLAUDE_WIFI_SIGNAL", null);
				return;
			}
			const fields = line.split(":")[1].trim().split(/\s+/);
			const level = parseFloat(fields[1]); // e.g. "-49."
			if (Number.isNaN(level)) {
				this.wifiSignal = null;
				this.sendSocketNotification("CLAUDE_WIFI_SIGNAL", null);
				return;
			}
			this.wifiSignal = level;
			this.sendSocketNotification("CLAUDE_WIFI_SIGNAL", level);
		});
	},

	socketNotificationReceived(notification) {
		// front-end asks for the current state on (re)connect
		if (notification === "CLAUDE_STATUS_HELLO") {
			this.sendSocketNotification("CLAUDE_STATE", this.current);
			if (this.piTemp != null) this.sendSocketNotification("CLAUDE_PI_TEMP", this.piTemp);
			this.sendSocketNotification("CLAUDE_WIFI_SIGNAL", this.wifiSignal);
		}
	}
});
