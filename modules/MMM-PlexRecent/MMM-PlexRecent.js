/* MMM-PlexRecent — "recently watched" list for the Plex page.
 * Hidden by MMM-pages CSS while something is actually playing (the
 * MMM-PlexNowPlaying module takes over then).
 */
Module.register("MMM-PlexRecent", {
	defaults: {
		serverProtocol: "http",
		serverAddress: "plex.local",
		serverPort: 32400,
		xPlexToken: "",
		count: 8,
		updateMinutes: 5,
		header: "Recently Watched"
	},

	getStyles () { return ["MMM-PlexRecent.css"]; },

	start () {
		this.data.header = this.config.header;
		this.items = null;
		this.ok = true;
		this.sendSocketNotification("PLEXRECENT_CONFIG", {
			protocol: this.config.serverProtocol,
			host: this.config.serverAddress,
			port: this.config.serverPort,
			token: this.config.xPlexToken,
			count: this.config.count,
			updateMinutes: this.config.updateMinutes
		});
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "PLEXRECENT_DATA") return;
		if (payload.ok) { this.items = payload.items; this.ok = true; }
		else { this.ok = false; }
		this.updateDom(300);
	},

	notificationReceived (notification, payload) {
		// hide the "recently watched" list while something is actually playing
		if (notification === "PLEX_SESSIONS") {
			if (payload > 0) this.hide(0);
			else this.show(300);
		}
	},

	ago (ts) {
		if (!ts) return "";
		const s = (Date.now() - ts) / 1000;
		if (s < 90) return "just now";
		if (s < 3600) return Math.round(s / 60) + "m ago";
		if (s < 86400) return Math.round(s / 3600) + "h ago";
		const d = Math.round(s / 86400);
		return d === 1 ? "yesterday" : d + "d ago";
	},

	getDom () {
		const wrap = document.createElement("div");
		wrap.className = "plexrecent";

		if (this.items === null) {
			wrap.innerHTML = '<div class="plexrecent-empty">Loading…</div>';
			return wrap;
		}
		if (!this.items.length) {
			wrap.innerHTML = '<div class="plexrecent-empty">No recent activity.</div>';
			return wrap;
		}

		this.items.forEach((m) => {
			const row = document.createElement("div");
			row.className = "plexrecent-row";

			const icon = document.createElement("span");
			icon.className = "mdi " + (m.type === "movie" ? "mdi-movie-open-outline"
				: m.type === "track" ? "mdi-music-note" : "mdi-television-classic");

			const main = document.createElement("span");
			main.className = "plexrecent-title";
			if (m.show) {
				const se = (m.season != null && m.episode != null)
					? ` · S${m.season}E${m.episode}` : "";
				main.textContent = m.show + se;
			} else {
				main.textContent = m.title + (m.year ? ` (${m.year})` : "");
			}

			const when = document.createElement("span");
			when.className = "plexrecent-when";
			when.textContent = this.ago(m.viewedAt);

			row.appendChild(icon);
			row.appendChild(main);
			row.appendChild(when);
			wrap.appendChild(row);
		});
		return wrap;
	}
});
