/* MMM-PlexRecent — pulls the Plex watch history for the "nothing playing" state
 * of the Plex page. Node 22 global fetch; no dependencies.
 */
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	start () {
		this.cfg = null;
		this.timer = null;
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "PLEXRECENT_CONFIG") return;
		this.cfg = payload || {};
		clearInterval(this.timer);
		this.poll();
		this.timer = setInterval(() => this.poll(), (this.cfg.updateMinutes || 5) * 60000);
	},

	async poll () {
		if (!this.cfg || !this.cfg.token) return;
		const { protocol = "http", host, port = 32400, token, count = 8 } = this.cfg;
		const url = `${protocol}://${host}:${port}/status/sessions/history/all` +
			`?sort=viewedAt:desc&X-Plex-Container-Size=${count}&X-Plex-Container-Start=0&X-Plex-Token=${token}`;
		try {
			const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
			const j = await r.json();
			const rows = (j.MediaContainer && j.MediaContainer.Metadata) || [];
			const items = rows.map((m) => ({
				type: m.type,
				title: m.title,
				show: m.grandparentTitle || m.parentTitle || null,
				season: m.parentIndex,
				episode: m.index,
				year: m.year,
				viewedAt: m.viewedAt ? Number(m.viewedAt) * 1000 : null,
				account: m.accountID
			}));
			this.sendSocketNotification("PLEXRECENT_DATA", { ok: true, items });
		} catch (e) {
			this.sendSocketNotification("PLEXRECENT_DATA", { ok: false, error: String(e) });
		}
	}
});
