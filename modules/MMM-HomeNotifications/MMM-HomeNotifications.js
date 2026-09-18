/* MMM-HomeNotifications — chip strip at the bottom of the Home page.
 * Listens for HOME_ALERTS (re-broadcast by MMM-Sidebar's HA poller).
 * Renders nothing when there are no active alerts.
 * Payload: [{ key, label, icon, level: info|warn|alert|critical, pulse }]
 */
Module.register("MMM-HomeNotifications", {
	defaults: {
		title: "Notifications",
		camerasPage: null   // page index — chips with a `camera` field become tap-to-open
	},

	getStyles () {
		return [
			"MMM-HomeNotifications.css",
			"modules/MMM-homeassistant-sensors/node_modules/@mdi/font/css/materialdesignicons.min.css"
		];
	},

	start () {
		this.alerts = [];
		this.extra = []; // room for future non-HA items pushed via HOME_NOTIFY
	},

	notificationReceived (notification, payload) {
		if (notification === "HOME_ALERTS") {
			this.alerts = Array.isArray(payload) ? payload : [];
			this.updateDom(300);
		} else if (notification === "HOME_NOTIFY") {
			// future: { key, label, icon, level, pulse, ttl }
			this.extra = Array.isArray(payload) ? payload : [];
			this.updateDom(300);
		}
	},

	getDom () {
		const items = [...this.alerts, ...this.extra];
		const wrap = document.createElement("div");
		wrap.className = "homenotif";
		if (!items.length) {
			wrap.classList.add("is-empty");
			return wrap;
		}
		const label = document.createElement("div");
		label.className = "homenotif-title";
		label.textContent = this.config.title;
		wrap.appendChild(label);

		const row = document.createElement("div");
		row.className = "homenotif-row";
		items.forEach((a) => {
			const chip = document.createElement("div");
			chip.className = "homenotif-chip lvl-" + (a.level || "warn") + (a.pulse ? " pulse" : "");
			const ic = document.createElement("span");
			ic.className = "mdi mdi-" + (a.icon || "alert-circle-outline");
			const lb = document.createElement("span");
			lb.className = "homenotif-label";
			lb.textContent = a.label || a.key;
			chip.appendChild(ic);
			chip.appendChild(lb);
			if (a.camera) {
				chip.classList.add("tappable");
				const go = document.createElement("span");
				go.className = "mdi mdi-chevron-right homenotif-go";
				chip.appendChild(go);
				chip.addEventListener("click", () => {
					this.sendNotification("CAMERAWALL_OPEN", a.camera);
					if (this.config.camerasPage != null) {
						this.sendNotification("PAGE_SELECT", this.config.camerasPage);
					}
				});
			}
			row.appendChild(chip);
		});
		wrap.appendChild(row);
		return wrap;
	}
});
