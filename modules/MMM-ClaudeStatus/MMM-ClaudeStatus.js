/* MMM-ClaudeStatus — tiny corner dot showing what Claude Code is doing,
 * plus a small Pi CPU-temp readout and wifi signal-strength bars underneath it.
 *   idle     -> faint grey dot (system alive, nothing happening)
 *   working  -> cyan dot, slow "breathing" pulse
 *   waiting  -> amber dot, fast flash + glow (Claude needs a human)
 *
 * State is pushed in over HTTP:  GET http://<mm-host>:8080/claude-status/<state>
 * (the node_helper registers that route on MagicMirror's own web server).
 * Claude Code hooks hit that URL on UserPromptSubmit / Stop / Notification /
 * SessionEnd. Both "working" and "waiting" also self-heal back to idle after a
 * timeout, so a missed reset (e.g. the CLI killed mid-turn) can't stick forever.
 *
 * The node_helper also polls /sys/class/thermal/thermal_zone0/temp and pushes
 * CLAUDE_PI_TEMP, and polls /proc/net/wireless for wlan0 signal level and pushes
 * CLAUDE_WIFI_SIGNAL (dBm), so the dot can carry live system-health readouts.
 */
Module.register("MMM-ClaudeStatus", {
	defaults: {
		idleAfter: 150000, // ms — if "working" and no further update, fall back to idle
		waitingIdleAfter: 300000, // ms — if "waiting" and no further update, fall back to idle
		showTemp: true,
		tempWarn: 70, // °C — readout turns amber at/above this
		tempHot: 80, // °C — readout turns red at/above this
		showWifi: true,
		wifiExcellentAt: -55, // dBm — at/above this: 4 bars, green
		wifiGoodAt: -65, // dBm — at/above this: 3 bars, green
		wifiFairAt: -72 // dBm — at/above this: 2 bars, amber; below: 1 bar, red
	},

	getStyles() {
		return ["MMM-ClaudeStatus.css"];
	},

	start() {
		this.state = "idle";
		this.piTemp = null;
		this.wifiSignal = null;
		this.sendSocketNotification("CLAUDE_STATUS_HELLO");
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "CLAUDE_PI_TEMP") {
			this.piTemp = payload;
			this.updateDom(0);
			return;
		}
		if (notification === "CLAUDE_WIFI_SIGNAL") {
			this.wifiSignal = payload;
			this.updateDom(0);
			return;
		}
		if (notification !== "CLAUDE_STATE") return;
		const s = ["idle", "working", "waiting"].includes(payload) ? payload : "idle";
		this.state = s;
		this.updateDom(0);
		clearTimeout(this._fallback);
		const fallbackAfter =
			s === "working" ? this.config.idleAfter :
			s === "waiting" ? this.config.waitingIdleAfter : 0;
		if (fallbackAfter > 0) {
			this._fallback = setTimeout(() => {
				this.state = "idle";
				this.updateDom(0);
			}, fallbackAfter);
		}
	},

	// 4-bar signal icon, bars filled + colored by dBm band
	buildWifiBars() {
		const el = document.createElement("div");
		const dBm = this.wifiSignal;

		let band = "none";
		let filled = 0;
		if (dBm != null) {
			if (dBm >= this.config.wifiExcellentAt) { band = "excellent"; filled = 4; }
			else if (dBm >= this.config.wifiGoodAt) { band = "good"; filled = 3; }
			else if (dBm >= this.config.wifiFairAt) { band = "fair"; filled = 2; }
			else { band = "weak"; filled = 1; }
		}

		el.className = "claude-wifi claude-wifi-" + band;
		el.title = dBm != null ? dBm + " dBm" : "wifi signal unavailable";
		for (let i = 1; i <= 4; i++) {
			const bar = document.createElement("span");
			bar.className = "claude-wifi-bar" + (i <= filled ? " filled" : "");
			el.appendChild(bar);
		}
		return el;
	},

	getDom() {
		const wrap = document.createElement("div");
		wrap.className = "claude-status-wrap";

		const dot = document.createElement("div");
		dot.className = "claude-dot claude-" + this.state;
		wrap.appendChild(dot);

		const showTemp = this.config.showTemp && this.piTemp != null;
		const showWifi = this.config.showWifi;
		if (showTemp || showWifi) {
			const row = document.createElement("div");
			row.className = "claude-status-row";

			if (showTemp) {
				const temp = document.createElement("div");
				let band = "";
				if (this.piTemp >= this.config.tempHot) band = " claude-temp-hot";
				else if (this.piTemp >= this.config.tempWarn) band = " claude-temp-warm";
				temp.className = "claude-temp" + band;
				temp.textContent = Math.round(this.piTemp) + "°";
				row.appendChild(temp);
			}

			if (showWifi) row.appendChild(this.buildWifiBars());

			wrap.appendChild(row);
		}
		return wrap;
	}
});
