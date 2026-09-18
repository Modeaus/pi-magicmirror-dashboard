/* Registers GET /trailcam-alert on MagicMirror's built-in web server (same
 * pattern as MMM-ClaudeStatus). Called by the IMAP watcher on
 * your mail-watcher script whenever a new-capture notification email arrives from
 * Moultrie Mobile. No image data is fetched or stored here or anywhere on
 * this Pi — just a "something happened" ping with a timestamp.
 */
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	start() {
		this.expressApp.get("/trailcam-alert", (req, res) => {
			this.sendSocketNotification("TRAILCAM_EVENT", { time: Date.now() });
			res.set("Cache-Control", "no-store");
			res.type("text/plain").send("ok");
		});
		console.log("[MMM-TrailCam] listening on /trailcam-alert");
	}
});
