/* MMM-CameraWall — the Cameras page (reached from the House tab, or by tapping a
 * motion notification).
 *   - a small live view per camera in a grid
 *   - tap a view -> that camera fills the screen
 *   - tap again -> back to the grid
 *   - no interaction for idleReturnMs -> back to the home page
 * Frames come from node_helper, which holds a persistent MJPEG connection to HA's
 * /api/camera_proxy_stream while the page is on screen (low latency, like the
 * Tapo app). The <img> tags point straight at the helper's MJPEG passthrough.
 */
Module.register("MMM-CameraWall", {
	defaults: {
		host: "homeassistant.local",
		port: 8123,
		token: "",
		cameras: [],            // [{ entity, label }]
		myPage: 6,
		homePage: 0,
		idleReturnMs: 60000
	},

	getStyles () {
		return [
			"MMM-CameraWall.css",
			"modules/MMM-homeassistant-sensors/node_modules/@mdi/font/css/materialdesignicons.min.css"
		];
	},

	start () {
		this.active = (this.config.myPage === this.config.homePage);
		this.full = null;         // entity id when one camera is fullscreen
		this.pendingOpen = null;  // camera to open once the page becomes active
		this.idleTimer = null;
		this.epoch = 0;           // bumped to force fresh MJPEG connections on (re)activate
		this.imgEls = [];         // live <img> elements — tracked so we can cut their streams

		this.sendSocketNotification("CAMERAWALL_CONFIG", {
			host: this.config.host,
			port: this.config.port,
			token: this.config.token,
			entities: this.config.cameras.map((c) => c.entity)
		});
	},

	notificationReceived (notification, payload) {
		if (notification === "CAMERAWALL_OPEN") {
			const ent = this.config.cameras.some((c) => c.entity === payload) ? payload : null;
			if (!ent) return;
			if (this.active) this.setFull(ent);
			else this.pendingOpen = ent;
			return;
		}
		if (notification !== "NEW_PAGE") return;
		const nowActive = payload === this.config.myPage;
		if (nowActive === this.active) return;
		this.active = nowActive;
		if (nowActive) {
			this.epoch++;
			this.viewSync();
			this.armIdle();
			if (this.pendingOpen) {
				const e = this.pendingOpen;
				this.pendingOpen = null;
				this.setFull(e);
			} else {
				this.updateDom(0);
			}
		} else {
			this.full = null;
			this.pendingOpen = null;
			clearTimeout(this.idleTimer);
			clearInterval(this.keepAlive);
			this.killImgs();   // cut the MJPEG connections now — a hidden module's DOM may not re-render
			this.sendSocketNotification("CAMERAWALL_VIEW", { active: false });
			this.updateDom(0);
		}
	},

	// abort every open MJPEG <img> connection and forget the elements
	killImgs () {
		this.imgEls.forEach((img) => {
			img.onload = null;
			img.onerror = null;
			img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
			if (img.parentNode) img.parentNode.removeChild(img);
		});
		this.imgEls = [];
	},

	viewSync () {
		// fullscreen -> only that camera needs to be live; grid -> all of them
		this.sendSocketNotification("CAMERAWALL_VIEW", {
			active: true,
			entities: this.full ? [this.full] : this.config.cameras.map((c) => c.entity)
		});
	},

	setFull (entity) {
		this.full = entity;
		this.viewSync();
		this.activity();
		this.updateDom(0);
	},

	activity () {
		this.sendNotification("USER_ACTIVITY");   // re-arm the sidebar idle timer too
		this.armIdle();
	},

	armIdle () {
		clearTimeout(this.idleTimer);
		if (this.config.idleReturnMs > 0) {
			this.idleTimer = setTimeout(
				() => this.sendNotification("PAGE_SELECT", this.config.homePage),
				this.config.idleReturnMs
			);
		}
		// keepalive: re-assert the view every 20s so the helper drops streams
		// promptly if this client goes away without a clean "inactive"
		clearInterval(this.keepAlive);
		this.keepAlive = setInterval(() => {
			if (this.active) this.viewSync();
			else clearInterval(this.keepAlive);
		}, 20000);
	},

	safe (ent) { return ent.replace(/[^a-z0-9_]/gi, "-"); },
	streamUrl (ent) { return `/mmm-camerawall/stream/${encodeURIComponent(ent)}?e=${this.epoch}`; },

	makeImg (ent) {
		const img = document.createElement("img");
		img.className = "camw-img";
		img.src = this.streamUrl(ent);
		this.imgEls.push(img);
		img.onload = () => {
			const box = img.closest(".camw-cell, .camw-full");
			if (box) box.classList.remove("no-signal");
		};
		img.onerror = () => {
			const box = img.closest(".camw-cell, .camw-full");
			if (box) box.classList.add("no-signal");
			setTimeout(() => {
				if (img.isConnected && this.active) img.src = this.streamUrl(ent) + "&r=" + Date.now();
			}, 3000);
		};
		return img;
	},

	getDom () {
		this.killImgs();   // drop the previous render's streams before building new ones
		const root = document.createElement("div");
		root.className = "camw";
		if (!this.active) return root;

		if (this.full) {
			const cam = this.config.cameras.find((c) => c.entity === this.full);
			const box = document.createElement("div");
			box.className = "camw-full";
			box.appendChild(this.makeImg(this.full));
			const cap = document.createElement("div");
			cap.className = "camw-cap";
			cap.textContent = (cam && cam.label) || this.full;
			box.appendChild(cap);
			const off = document.createElement("div");
			off.className = "camw-offmsg";
			off.textContent = "No signal";
			box.appendChild(off);
			box.addEventListener("click", () => this.setFull(null));
			root.appendChild(box);
			return root;
		}

		const grid = document.createElement("div");
		grid.className = "camw-grid camw-n" + this.config.cameras.length;
		this.config.cameras.forEach((cam) => {
			const cell = document.createElement("div");
			cell.className = "camw-cell";
			cell.appendChild(this.makeImg(cam.entity));
			const label = document.createElement("div");
			label.className = "camw-label";
			label.textContent = cam.label || cam.entity;
			cell.appendChild(label);
			const off = document.createElement("div");
			off.className = "camw-offmsg";
			off.textContent = "Offline";
			cell.appendChild(off);
			cell.addEventListener("click", () => this.setFull(cam.entity));
			grid.appendChild(cell);
		});
		root.appendChild(grid);
		return root;
	}
});
