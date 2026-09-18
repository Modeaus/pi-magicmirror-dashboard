/* MMM-Sidebar — vertical tab bar (left edge) that drives MMM-pages.
 *  - tap a tab -> sendNotification("PAGE_SELECT", page)
 *  - listens for "NEW_PAGE" to highlight the active tab
 *  - after idleReturnMs on a non-home page, returns to the home page
 *  - tabs with a `state` key ("plex" / "ha") get a live colour + count badge,
 *    polled by node_helper.
 */
Module.register("MMM-Sidebar", {
	defaults: {
		homePage: 0,
		idleReturnMs: 60000,
		pollMs: 15000,
		tabs: [],
		navTargets: [], // [{ selector, page }] — make arbitrary elements tap-to-navigate
		plex: null, // { host, port, token }
		ha: null    // { host, port, token, lights: [], alerts: [] }
	},

	getStyles() {
		return [
			"MMM-Sidebar.css",
			"modules/MMM-homeassistant-sensors/node_modules/@mdi/font/css/materialdesignicons.min.css"
		];
	},

	start() {
		this.active = this.config.homePage;
		this.states = {};
		this.idleTimer = null;
		this.sendSocketNotification("SIDEBAR_CONFIG", {
			plex: this.config.plex,
			ha: this.config.ha,
			pollMs: this.config.pollMs
		});

		if (this.config.navTargets.length) {
			setTimeout(() => this.bindNav(), 2500);
			setInterval(() => this.bindNav(), 5000);
		}
	},

	bindNav() {
		this.config.navTargets.forEach((t) => {
			document.querySelectorAll(t.selector).forEach((el) => {
				if (el.dataset.navBound) return;
				el.dataset.navBound = "1";
				el.style.cursor = "pointer";
				el.addEventListener("click", () => this.sendNotification("PAGE_SELECT", t.page));
			});
		});
	},

	notificationReceived(notification, payload) {
		if (notification === "NEW_PAGE") {
			this.active = payload;
			this.armIdle();
			this.updateDom(0);
		} else if (notification === "USER_ACTIVITY") {
			// a page reported a tap — restart the idle-return countdown
			this.armIdle();
		}
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "SIDEBAR_STATE") {
			this.states = payload || {};
			// let other modules react
			if (this.states.plex) {
				this.sendNotification("PLEX_SESSIONS", this.states.plex.count || 0);
			}
			// home notification chips = HA alerts + camera motion + live Plex streams
			const chips = [...(this.states.homeAlerts || []), ...(this.states.motionChips || [])];
			const px = this.states.plex;
			if (px && px.sessions && px.sessions.length) {
				const multi = px.sessions.length > 1;
				px.sessions.forEach((s, i) => chips.push({
					key: "plex-" + i,
					label: s.title + (multi && s.user ? "  (" + s.user + ")" : ""),
					icon: s.paused ? "pause"
						: s.type === "track" ? "music"
						: s.type === "movie" ? "movie-open-play"
						: "television-play",
					level: "plex",
					pulse: false
				}));
			}
			this.sendNotification("HOME_ALERTS", chips);
			this.updateDom(0);
		}
	},

	armIdle() {
		clearTimeout(this.idleTimer);
		if (this.active !== this.config.homePage && this.config.idleReturnMs > 0) {
			this.idleTimer = setTimeout(() => {
				this.sendNotification("PAGE_SELECT", this.config.homePage);
			}, this.config.idleReturnMs);
		}
	},

	getDom() {
		const bar = document.createElement("div");
		bar.className = "sidebar-tabs";
		this.config.tabs.forEach((tab) => {
			const el = document.createElement("div");
			el.className = "sidebar-tab" + (tab.page === this.active ? " active" : "");
			const st = tab.state ? this.states[tab.state] : null;
			if (st && st.active) el.classList.add("lit");
			if (st && st.alert) el.classList.add("alert");

			const icon = document.createElement("span");
			icon.className = "mdi mdi-" + tab.icon;
			el.appendChild(icon);

			if (st && st.active && st.count > 0) {
				const badge = document.createElement("span");
				badge.className = "sidebar-badge";
				badge.textContent = st.count;
				el.appendChild(badge);
			}

			const label = document.createElement("span");
			label.className = "sidebar-label";
			label.textContent = tab.label;
			el.appendChild(label);

			el.addEventListener("click", () => {
				if (tab.page !== this.active) this.sendNotification("PAGE_SELECT", tab.page);
			});
			bar.appendChild(el);
		});
		return bar;
	}
});
