/* Registers GET /claude-status/:state on MagicMirror's web server and relays the
 * state to the front-end module. Also exposes /claude-status (no arg) -> current.
 * Separately polls the SoC temperature and pushes CLAUDE_PI_TEMP to the module. */
const NodeHelper = require("node_helper");
const fs = require("fs");

const TEMP_PATH = "/sys/class/thermal/thermal_zone0/temp";
const TEMP_INTERVAL = 15000; // ms

module.exports = NodeHelper.create({
	start() {
		this.current = "idle";
		this.piTemp = null;

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

	socketNotificationReceived(notification) {
		// front-end asks for the current state on (re)connect
		if (notification === "CLAUDE_STATUS_HELLO") {
			this.sendSocketNotification("CLAUDE_STATE", this.current);
			if (this.piTemp != null) this.sendSocketNotification("CLAUDE_PI_TEMP", this.piTemp);
		}
	}
});
