/* Polls Plex sessions + Home Assistant states and reports per-tab activity
 * back to the MMM-Sidebar front-end. Node 22 global fetch; no dependencies. */
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	start() {
		this.cfg = null;
		this.timer = null;
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "SIDEBAR_CONFIG") {
			this.cfg = payload || {};
			clearInterval(this.timer);
			this.poll();
			this.timer = setInterval(() => this.poll(), this.cfg.pollMs || 15000);
		}
	},

	async poll() {
		const out = {};

		if (this.cfg.plex && this.cfg.plex.token) {
			const p = this.cfg.plex;
			try {
				const r = await fetch(
					`http://${p.host}:${p.port}/status/sessions?X-Plex-Token=${p.token}`,
					{ headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) }
				);
				const j = await r.json();
				const mc = j.MediaContainer || {};
				const n = mc.size || 0;
				const sessions = (mc.Metadata || []).map((m) => {
					const se = (m.parentIndex != null && m.index != null) ? ` · S${m.parentIndex}E${m.index}` : "";
					return {
						type: m.type,
						title: (m.grandparentTitle ? m.grandparentTitle + se : m.title),
						user: (m.User && m.User.title) || null,
						paused: !!(m.Player && m.Player.state === "paused")
					};
				});
				out.plex = { active: n > 0, count: n, sessions };
			} catch (e) {
				out.plex = { active: false, count: 0, sessions: [] };
			}
		}

		if (this.cfg.ha && this.cfg.ha.token) {
			const h = this.cfg.ha;
			try {
				const r = await fetch(`http://${h.host}:${h.port}/api/states`, {
					headers: { Authorization: `Bearer ${h.token}` },
					signal: AbortSignal.timeout(6000)
				});
				const states = await r.json();
				const stateOf = (id) => {
					const s = states.find((x) => x.entity_id === id);
					return s ? String(s.state).toLowerCase() : null;
				};
				const OPEN = ["on", "open", "playing", "home", "wet", "unlocked", "detected"];
				const isOn = (id) => OPEN.includes(stateOf(id));
				const lightsOn = (h.lights || []).filter(isOn).length;
				const alertsOn = (h.alerts || []).filter(isOn).length;
				out.ha = { active: lightsOn + alertsOn > 0, count: lightsOn, alert: alertsOn > 0 };

				// home-screen notification chips
				const hr = new Date().getHours();
				out.homeAlerts = (h.alertEntities || []).map((a) => {
					if (!isOn(a.entity)) return null;
					let level = a.level || "warn";
					if (a.redAfterHour != null && hr >= a.redAfterHour) level = "critical";
					return { key: a.entity, label: a.label, icon: a.icon, level, pulse: !!a.pulse };
				}).filter(Boolean);

				// camera-motion chips — tappable (open the camera fullscreen),
				// held for motionHoldMs after the sensor last read "on"
				const now = Date.now();
				const hold = h.motionHoldMs || 90000;
				this.motionSince = this.motionSince || {};
				out.motionChips = (h.cameraMotion || []).map((m) => {
					const live = isOn(m.entity);
					if (live) this.motionSince[m.entity] = now;
					const since = this.motionSince[m.entity];
					if (!since || now - since > hold) return null;
					return {
						key: "motion-" + m.entity,
						label: (m.label ? m.label + " " : "") + "Motion",
						icon: m.icon || "motion-sensor",
						level: "alert",
						pulse: live,
						camera: m.camera
					};
				}).filter(Boolean);
			} catch (e) {
				out.ha = { active: false, count: 0 };
			}
		}

		this.sendSocketNotification("SIDEBAR_STATE", out);
	}
});
