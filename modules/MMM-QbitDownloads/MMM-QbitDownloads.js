/* MMM-QbitDownloads — right-hand panel of the Plex page.
 * Shows what qBittorrent is currently downloading, plus the torrents it
 * finished most recently. Read-only; polls the WebUI API.
 * Auth: this assumes your LAN subnet is whitelisted in qBittorrent's WebUI
 * settings, so no login is needed. Add one if yours isn't.
 */
Module.register("MMM-QbitDownloads", {
	defaults: {
		host: "qbittorrent.local",
		port: 8080,
		protocol: "http",
		updateInterval: 15,      // seconds
		activeMax: 6,            // rows in the "Downloading" list
		recentMax: 6,            // rows in the "Recently Completed" list
		recentDays: 10,          // how far back "recently completed" reaches
		header: "Downloads"
	},

	getStyles () {
		return [
			"MMM-QbitDownloads.css",
			"modules/MMM-homeassistant-sensors/node_modules/@mdi/font/css/materialdesignicons.min.css"
		];
	},

	start () {
		this.data.header = this.config.header;
		this.payload = null;
		this.ok = true;
		this.sendSocketNotification("QBIT_CONFIG", {
			protocol: this.config.protocol,
			host: this.config.host,
			port: this.config.port,
			updateInterval: this.config.updateInterval,
			recentDays: this.config.recentDays
		});
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "QBIT_DATA") return;
		if (payload.ok) { this.payload = payload; this.ok = true; }
		else { this.ok = false; }
		this.updateDom(300);
	},

	// "Buffy.The.Vampire.Slayer.S02.1080p.WEBRip..." -> "Buffy The Vampire Slayer S02"
	pretty (name) {
		let n = name.replace(/[._]+/g, " ").trim();
		const m = n.match(
			/[([]?\b(1080p|2160p|4k|720p|480p|web[- ]?dl|webrip|web[- ]?rip|bluray|blu-ray|bdrip|hdrip|dvdrip|hdtv|remux|x264|x265|h ?264|h ?265|hevc|avc|xvid|divx|10bit|ddp?\d|dd\+?\d|eac3|aac|ac3|flac|atmos|truehd|dts|hdr\d*|dovi|sdr|proper|repack|internal|complete|multi|dual|imax|extended|uncut|remastered)\b/i
		);
		if (m && m.index > 2) n = n.slice(0, m.index);
		n = n.replace(/[\s([{–-]+$/, "").trim();
		return n || name.replace(/[._]+/g, " ").trim();
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

	fmtEta (sec) {
		if (sec == null || sec <= 0 || sec >= 8640000) return "";
		if (sec < 3600) return Math.round(sec / 60) + "m";
		if (sec < 86400) return Math.round(sec / 3600) + "h";
		return Math.round(sec / 86400) + "d";
	},

	fmtSpeed (bps) {
		if (!bps) return "";
		const mb = bps / 1e6;
		return mb >= 1 ? mb.toFixed(1) + " MB/s" : Math.round(bps / 1e3) + " kB/s";
	},

	section (label, klass) {
		const h = document.createElement("div");
		h.className = "qbit-sec " + klass;
		h.textContent = label;
		return h;
	},

	getDom () {
		const wrap = document.createElement("div");
		wrap.className = "qbit";

		if (this.payload === null && this.ok) {
			wrap.innerHTML = '<div class="qbit-empty">Loading…</div>';
			return wrap;
		}
		if (!this.ok) {
			wrap.innerHTML = '<div class="qbit-empty qbit-err">qBittorrent unreachable</div>';
			return wrap;
		}

		const { active = [], done = [] } = this.payload;

		// ---- Downloading ----
		wrap.appendChild(this.section(
			active.length ? `Downloading · ${active.length}` : "Downloading", "qbit-sec-dl"));
		if (!active.length) {
			const e = document.createElement("div");
			e.className = "qbit-empty";
			e.textContent = "Nothing active.";
			wrap.appendChild(e);
		} else {
			active.slice(0, this.config.activeMax).forEach((t) => {
				const row = document.createElement("div");
				row.className = "qbit-row qbit-dl";

				const title = document.createElement("div");
				title.className = "qbit-title";
				title.textContent = this.pretty(t.name);

				const bar = document.createElement("div");
				bar.className = "qbit-bar";
				const fill = document.createElement("div");
				fill.className = "qbit-bar-fill";
				fill.style.width = Math.round(t.progress * 100) + "%";
				if (t.stalled) fill.classList.add("stalled");
				bar.appendChild(fill);

				const meta = document.createElement("div");
				meta.className = "qbit-meta";
				const pct = document.createElement("span");
				pct.textContent = (t.progress * 100).toFixed(t.progress >= 0.1 ? 0 : 1) + "%";
				const right = document.createElement("span");
				right.className = "qbit-meta-r";
				const eta = this.fmtEta(t.eta);
				right.textContent = t.stalled
					? "stalled"
					: [this.fmtSpeed(t.dlspeed), eta && "· " + eta].filter(Boolean).join(" ");
				meta.appendChild(pct);
				meta.appendChild(right);

				row.appendChild(title);
				row.appendChild(bar);
				row.appendChild(meta);
				wrap.appendChild(row);
			});
		}

		// ---- Recently completed ----
		wrap.appendChild(this.section("Recently Completed", "qbit-sec-done"));
		if (!done.length) {
			const e = document.createElement("div");
			e.className = "qbit-empty";
			e.textContent = "None in the last " + this.config.recentDays + " days.";
			wrap.appendChild(e);
		} else {
			done.slice(0, this.config.recentMax).forEach((t) => {
				const row = document.createElement("div");
				row.className = "qbit-row qbit-done";

				const icon = document.createElement("span");
				icon.className = "mdi mdi-check-circle-outline";

				const title = document.createElement("span");
				title.className = "qbit-title";
				title.textContent = this.pretty(t.name);

				const when = document.createElement("span");
				when.className = "qbit-when";
				when.textContent = this.ago(t.completedAt);

				row.appendChild(icon);
				row.appendChild(title);
				row.appendChild(when);
				wrap.appendChild(row);
			});
		}

		return wrap;
	}
});
