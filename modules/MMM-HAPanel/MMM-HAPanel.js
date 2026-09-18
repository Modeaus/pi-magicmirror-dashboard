/* MMM-HAPanel — Home Assistant control + status panel for the House page.
 *   - light/switch tiles in a 2-column grid, lightbulb icons, tap to toggle
 *   - garage-door row: green closed / pulsing amber open / pulsing red open-after-N
 *     tap to arm (3s), tap again to fire the relay
 *   - narrow sensor list (temps + problem sensors)
 * All HA traffic goes through node_helper (one poller).
 */
Module.register("MMM-HAPanel", {
	defaults: {
		host: "homeassistant.local",
		port: 8123,
		token: "",
		updateInterval: 20000,
		lights: [],   // [{ entity, label }]
		sensors: [],  // [{ entity, label, unit?, on?, off? }]  on/off => binary "problem" sensor
		garage: null, // { state, relay, label, redAfterHour }
		camerasPage: null // page index of the Cameras page — adds a nav tile when set
	},

	getStyles () {
		return [
			"MMM-HAPanel.css",
			"modules/MMM-homeassistant-sensors/node_modules/@mdi/font/css/materialdesignicons.min.css"
		];
	},

	start () {
		this.states = {};
		this.ok = true;
		this.garageArmed = false;
		this.armTimer = null;

		const entities = [];
		this.config.lights.forEach((l) => entities.push(l.entity));
		this.config.sensors.forEach((s) => entities.push(s.entity));
		if (this.config.garage) {
			entities.push(this.config.garage.state);
			if (this.config.garage.relay) entities.push(this.config.garage.relay);
		}

		this.sendSocketNotification("HAPANEL_CONFIG", {
			host: this.config.host,
			port: this.config.port,
			token: this.config.token,
			updateInterval: this.config.updateInterval,
			entities
		});

		// keep the garage time-of-day colour honest even between polls
		this.tick = setInterval(() => this.updateDom(0), 60000);
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "HAPANEL_STATE") return;
		if (payload.ok) {
			this.states = payload.entities || {};
			this.ok = true;
		} else {
			this.ok = false;
			Log.warn("[MMM-HAPanel] " + payload.error);
		}
		this.updateDom(0);
	},

	stateOf (entity) {
		return (this.states[entity] || {}).state;
	},

	isOn (entity) {
		return ["on", "open", "playing", "home", "wet", "unlocked"].includes(String(this.stateOf(entity)).toLowerCase());
	},

	callToggle (entity) {
		const domain = entity.split(".")[0];
		this.sendSocketNotification("HAPANEL_CALL", { domain, service: "toggle", entity_id: entity });
	},

	disarmGarage () {
		clearTimeout(this.armTimer);
		this.garageArmed = false;
		this.updateDom(0);
	},

	getDom () {
		const root = document.createElement("div");
		root.className = "hapanel" + (this.ok ? "" : " hapanel-stale");

		// ---- lights / switches ----
		if (this.config.lights.length) {
			const grid = document.createElement("div");
			grid.className = "ha-lights";
			this.config.lights.forEach((l) => {
				const on = this.isOn(l.entity);
				const tile = document.createElement("div");
				tile.className = "ha-tile " + (on ? "on" : "off");
				const icon = document.createElement("span");
				icon.className = "mdi " + (on ? "mdi-lightbulb" : "mdi-lightbulb-outline");
				const label = document.createElement("span");
				label.className = "ha-tile-label";
				label.textContent = l.label;
				tile.appendChild(icon);
				tile.appendChild(label);
				tile.addEventListener("click", () => {
					// optimistic flip
					this.states[l.entity] = { state: on ? "off" : "on" };
					this.updateDom(0);
					this.callToggle(l.entity);
				});
				grid.appendChild(tile);
			});
			root.appendChild(grid);
		}

		// ---- garage door ----
		if (this.config.garage) {
			const g = this.config.garage;
			const open = this.isOn(g.state);
			const late = open && new Date().getHours() >= (g.redAfterHour || 21);
			const row = document.createElement("div");
			row.className = "ha-garage " + (open ? (late ? "alert-late" : "alert") : "closed") +
				(this.garageArmed ? " armed" : "");
			const icon = document.createElement("span");
			icon.className = "mdi " + (open ? "mdi-garage-open-variant" : "mdi-garage-variant");
			const text = document.createElement("span");
			text.className = "ha-garage-text";
			if (this.garageArmed) {
				text.textContent = open ? "Tap again to CLOSE" : "Tap again to OPEN";
			} else {
				text.textContent = (g.label || "Garage") + " · " + (open ? "Open" : "Closed");
			}
			row.appendChild(icon);
			row.appendChild(text);
			if (g.relay) {
				row.addEventListener("click", () => {
					if (this.garageArmed) {
						this.callToggle(g.relay);
						this.disarmGarage();
					} else {
						this.garageArmed = true;
						clearTimeout(this.armTimer);
						this.armTimer = setTimeout(() => this.disarmGarage(), 3000);
						this.updateDom(0);
					}
				});
			}
			root.appendChild(row);
		}

		// ---- sensor list ----
		if (this.config.sensors.length) {
			const list = document.createElement("div");
			list.className = "ha-sensors";
			this.config.sensors.forEach((s) => {
				const raw = this.stateOf(s.entity);
				const binary = s.on !== undefined || s.off !== undefined;
				const alert = binary && this.isOn(s.entity);
				const rowEl = document.createElement("div");
				rowEl.className = "ha-sensor" + (alert ? " alert" : "");
				const label = document.createElement("span");
				label.className = "ha-sensor-label";
				label.textContent = s.label;
				const val = document.createElement("span");
				val.className = "ha-sensor-value";
				if (binary) {
					val.textContent = this.isOn(s.entity) ? (s.on || "On") : (s.off || "Off");
				} else if (raw === undefined || raw === "unavailable" || raw === "unknown") {
					val.textContent = "–";
				} else {
					val.textContent = Math.round(parseFloat(raw)) + (s.unit || "");
				}
				rowEl.appendChild(label);
				rowEl.appendChild(val);
				list.appendChild(rowEl);
			});
			root.appendChild(list);
		}

		// ---- cameras nav ----
		if (this.config.camerasPage != null) {
			const nav = document.createElement("div");
			nav.className = "ha-camnav";
			const icon = document.createElement("span");
			icon.className = "mdi mdi-cctv";
			const text = document.createElement("span");
			text.className = "ha-camnav-text";
			text.textContent = "Cameras";
			const chev = document.createElement("span");
			chev.className = "mdi mdi-chevron-right ha-camnav-chev";
			nav.appendChild(icon);
			nav.appendChild(text);
			nav.appendChild(chev);
			nav.addEventListener("click", () => {
				this.sendNotification("PAGE_SELECT", this.config.camerasPage);
			});
			root.appendChild(nav);
		}

		return root;
	}
});
