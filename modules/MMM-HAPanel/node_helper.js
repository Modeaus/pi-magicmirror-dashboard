/* MMM-HAPanel — single Home Assistant poller for the House page.
 * Polls /api/states, pushes the entities the front-end cares about, and
 * calls services on tap. Node 22 global fetch; no dependencies.
 */
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	start () {
		this.cfg = null;
		this.timer = null;
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "HAPANEL_CONFIG") {
			this.cfg = payload || {};
			clearInterval(this.timer);
			this.poll();
			this.timer = setInterval(() => this.poll(), this.cfg.updateInterval || 20000);
		} else if (notification === "HAPANEL_CALL") {
			this.callService(payload);
		}
	},

	base () {
		return `http://${this.cfg.host}:${this.cfg.port}`;
	},

	headers () {
		return { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" };
	},

	async poll () {
		if (!this.cfg || !this.cfg.token) return;
		try {
			const r = await fetch(`${this.base()}/api/states`, {
				headers: this.headers(),
				signal: AbortSignal.timeout(8000)
			});
			const states = await r.json();
			const want = new Set(this.cfg.entities || []);
			const out = {};
			for (const s of states) {
				if (want.has(s.entity_id)) {
					out[s.entity_id] = {
						state: s.state,
						brightness: s.attributes && s.attributes.brightness
					};
				}
			}
			this.sendSocketNotification("HAPANEL_STATE", { ok: true, entities: out });
		} catch (e) {
			this.sendSocketNotification("HAPANEL_STATE", { ok: false, error: String(e) });
		}
	},

	async callService ({ domain, service, entity_id }) {
		if (!this.cfg || !this.cfg.token) return;
		try {
			await fetch(`${this.base()}/api/services/${domain}/${service}`, {
				method: "POST",
				headers: this.headers(),
				body: JSON.stringify({ entity_id }),
				signal: AbortSignal.timeout(8000)
			});
		} catch (e) {
			this.sendSocketNotification("HAPANEL_STATE", { ok: false, error: `call ${domain}.${service}: ${e}` });
		}
		// confirm the change quickly
		setTimeout(() => this.poll(), 900);
	}
});
