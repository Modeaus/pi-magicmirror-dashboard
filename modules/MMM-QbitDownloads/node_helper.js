/* MMM-QbitDownloads — polls the qBittorrent WebUI on "boss".
 * Node 22 global fetch; no dependencies. boss whitelists the LAN subnet so
 * no auth/login is needed — a plain GET works.
 */
const NodeHelper = require("node_helper");

const ACTIVE_STATES = new Set([
	"downloading", "forcedDL", "metaDL", "stalledDL",
	"queuedDL", "checkingDL", "allocating"
]);

module.exports = NodeHelper.create({
	start () {
		this.cfg = null;
		this.timer = null;
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "QBIT_CONFIG") return;
		this.cfg = payload || {};
		clearInterval(this.timer);
		this.poll();
		this.timer = setInterval(() => this.poll(), (this.cfg.updateInterval || 15) * 1000);
	},

	async poll () {
		if (!this.cfg || !this.cfg.host) return;
		const { protocol = "http", host, port = 8080, recentDays = 10 } = this.cfg;
		const url = `${protocol}://${host}:${port}/api/v2/torrents/info`;
		try {
			const r = await fetch(url, {
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(8000)
			});
			if (!r.ok) throw new Error("HTTP " + r.status);
			const list = await r.json();
			const now = Date.now();

			const active = list
				.filter((t) => t.progress < 1 &&
					(ACTIVE_STATES.has(t.state) || t.dlspeed > 0))
				.sort((a, b) => b.progress - a.progress)
				.map((t) => ({
					name: t.name,
					progress: t.progress,
					dlspeed: t.dlspeed,
					eta: t.eta,
					state: t.state,
					stalled: t.state === "stalledDL" || t.dlspeed < 1024
				}));

			const cutoff = now / 1000 - recentDays * 86400;
			const done = list
				.filter((t) => t.completion_on && t.completion_on > cutoff && t.progress >= 1)
				.sort((a, b) => b.completion_on - a.completion_on)
				.map((t) => ({ name: t.name, completedAt: t.completion_on * 1000 }));

			this.sendSocketNotification("QBIT_DATA", { ok: true, active, done });
		} catch (e) {
			this.sendSocketNotification("QBIT_DATA", { ok: false, error: String(e) });
		}
	}
});
