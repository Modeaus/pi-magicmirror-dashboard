/* MMM-TrailCam — bridges an external HTTP ping (new capture notification
 * email seen by the watcher on your mail-watcher script) into the existing
 * HOME_NOTIFY chip mechanism already consumed by MMM-HomeNotifications.
 * Renders nothing of its own; purely a relay.
 */
Module.register("MMM-TrailCam", {
	defaults: {
		clearAfterMs: 5 * 60 * 1000, // how long the chip stays up
		galleryUrl: "https://web.moultriemobile.com/gallery"
	},

	start () {
		this._clearTimer = null;
		// Establishes this module's client->server socket channel. Without an
		// initial outbound message, MagicMirror never wires up this module's
		// inbound side either, so node_helper's pushes silently go nowhere
		// (confirmed 2026-09-12 — see MMM-ClaudeStatus, which does the same).
		this.sendSocketNotification("TRAILCAM_HELLO");
	},

	socketNotificationReceived (notification) {
		if (notification !== "TRAILCAM_EVENT") return;

		this.sendNotification("HOME_NOTIFY", [{
			key: "trailcam",
			label: "New trail cam photo",
			icon: "cctv",
			level: "info",
			pulse: true,
			link: this.config.galleryUrl
		}]);

		if (this._clearTimer) clearTimeout(this._clearTimer);
		this._clearTimer = setTimeout(() => {
			this.sendNotification("HOME_NOTIFY", []);
			this._clearTimer = null;
		}, this.config.clearAfterMs);
	},

	getDom () {
		return document.createElement("div");
	}
});
