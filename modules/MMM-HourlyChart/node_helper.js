/* MMM-HourlyChart — pulls the NWS hourly grid forecast for a compact
 * temperature-curve chart. Node 22 global fetch; no dependencies.
 */
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	start () {
		this.cfg = null;
		this.timer = null;
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "HOURLYCHART_CONFIG") return;
		this.cfg = payload || {};
		this.fails = 0;
		clearInterval(this.timer);
		this.poll();
		this.timer = setInterval(() => this.poll(), (this.cfg.updateMinutes || 20) * 60000);
	},

	async poll () {
		if (!this.cfg || !this.cfg.grid) return;
		const url = `https://api.weather.gov/gridpoints/${this.cfg.grid}/forecast/hourly`;
		try {
			const r = await fetch(url, {
				headers: { "User-Agent": "MagicMirror mirror-panel", Accept: "application/geo+json" },
				signal: AbortSignal.timeout(15000)
			});
			if (!r.ok) throw new Error("HTTP " + r.status);
			const j = await r.json();
			const periods = (j.properties && j.properties.periods) || [];
			const hours = (this.cfg.hours || 12);
			const out = periods.slice(0, hours).map((p) => ({
				time: p.startTime,
				temp: p.temperature,
				pop: (p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value) || 0,
				wind: p.windSpeed,
				day: p.isDaytime,
				short: p.shortForecast
			}));
			this.fails = 0;
			this.sendSocketNotification("HOURLYCHART_DATA", { ok: true, periods: out });
		} catch (e) {
			this.fails = (this.fails || 0) + 1;
			this.sendSocketNotification("HOURLYCHART_DATA", { ok: false, error: String(e) });
			// weak wifi: retry soon rather than wait the full interval
			clearTimeout(this.retry);
			this.retry = setTimeout(() => this.poll(), Math.min(45000 * this.fails, 300000));
		}
	}
});
