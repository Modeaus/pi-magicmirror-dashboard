/* MMM-CameraWall — low-latency camera frames for the Cameras page.
 *
 * HA's /api/camera_proxy (snapshot) cold-starts ffmpeg + RTSP on every call
 * (~3 s each) so polling it is always seconds behind. /api/camera_proxy_stream
 * is an MJPEG stream that, held open, delivers frames continuously with ~1 s
 * latency (what the Tapo app does). This helper holds one persistent MJPEG
 * connection per camera *while the page is being viewed*, keeps the latest
 * frame, and serves:
 *    GET /mmm-camerawall/:entity          -> latest JPEG (grid thumbnails poll this)
 *    GET /mmm-camerawall/stream/:entity   -> MJPEG passthrough (fullscreen uses this)
 * Connections open on CAMERAWALL_VIEW {active:true,...} and close shortly after
 * the page is left, so the bandwidth cost only exists during actual viewing.
 * Node 22 global fetch; no dependencies.
 */
const NodeHelper = require("node_helper");

const BOUNDARY = "mmmcamframe";
const IDLE_CLOSE_MS = 6000;   // drop streams this long after the page is left
const STALE_MS = 20000;       // frame older than this -> 503 / "no signal"
const RECONNECT_MS = 3000;

module.exports = NodeHelper.create({
	start () {
		this.cfg = null;
		this.streams = {};           // entity -> stream state
		this.wanted = new Set();     // entities the page currently wants live
		this.lastView = 0;           // last "active" heartbeat from the front-end
		this.closeTimer = null;

		// sweep: drop any stream that's neither wanted nor has an MJPEG viewer;
		// and if the viewing client went silent, forget what's wanted
		setInterval(() => {
			if (this.wanted.size && Date.now() - this.lastView > 45000) this.wanted.clear();
			Object.keys(this.streams).forEach((e) => {
				if (!this.wanted.has(e) && !this.streams[e].subs.size) this.close(e);
			});
		}, 5000);

		this.expressApp.get("/mmm-camerawall/stream/:entity", (req, res) => {
			const ent = String(req.params.entity || "");
			if (!this.cfg || !this.cfg.allow.has(ent)) return res.sendStatus(404);
			const s = this.ensure(ent);
			res.writeHead(200, {
				"Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
				"Cache-Control": "no-store, no-cache, must-revalidate",
				"Connection": "close",
				"Pragma": "no-cache"
			});
			s.subs.add(res);
			if (s.frame) this.writeFrame(res, s.frame);
			req.on("close", () => s.subs.delete(res));
		});

		this.expressApp.get("/mmm-camerawall/:entity", (req, res) => {
			const ent = String(req.params.entity || "");
			if (!this.cfg || !this.cfg.allow.has(ent)) return res.sendStatus(404);
			const s = this.ensure(ent);
			if (!s.frame || Date.now() - s.ts > STALE_MS) return res.sendStatus(503);
			res.set("Content-Type", "image/jpeg");
			res.set("Cache-Control", "no-store");
			res.send(s.frame);
		});

		console.log("[MMM-CameraWall] ready on /mmm-camerawall/:entity (+ /stream/:entity)");
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "CAMERAWALL_CONFIG") {
			this.cfg = {
				host: payload.host, port: payload.port, token: payload.token,
				allow: new Set(payload.entities || []),
				list: payload.entities || []
			};
		} else if (notification === "CAMERAWALL_VIEW") {
			clearTimeout(this.closeTimer);
			if (payload && payload.active) {
				this.lastView = Date.now();
				this.wanted = new Set(payload.entities || []);
				this.wanted.forEach((e) => this.ensure(e));
				// drop streams that are no longer wanted and have no MJPEG viewer
				Object.keys(this.streams).forEach((e) => {
					if (!this.wanted.has(e) && !this.streams[e].subs.size) this.close(e);
				});
			} else {
				this.closeTimer = setTimeout(() => {
					this.wanted.clear();
					Object.keys(this.streams).forEach((e) => {
						if (!this.streams[e].subs.size) this.close(e);
					});
				}, IDLE_CLOSE_MS);
			}
		}
	},

	ensure (ent) {
		if (!this.streams[ent]) {
			this.streams[ent] = { abort: null, frame: null, ts: 0, subs: new Set(), connected: false, timer: null };
		}
		const s = this.streams[ent];
		if (!s.connected && this.cfg && this.cfg.token) this.connect(ent);
		return s;
	},

	async connect (ent) {
		const s = this.streams[ent];
		if (!s || s.connected) return;
		s.connected = true;
		const ac = new AbortController();
		s.abort = ac;
		try {
			const r = await fetch(
				`http://${this.cfg.host}:${this.cfg.port}/api/camera_proxy_stream/${ent}`,
				{ headers: { Authorization: `Bearer ${this.cfg.token}` }, signal: ac.signal }
			);
			if (!r.ok || !r.body) throw new Error("HTTP " + r.status);
			let buf = Buffer.alloc(0);
			for await (const chunk of r.body) {
				buf = Buffer.concat([buf, Buffer.from(chunk)]);
				// keep only the newest complete JPEG in this batch — dropping any
				// intermediate frames keeps slow viewers from falling behind live
				let newest = null;
				let soi;
				while ((soi = buf.indexOf("ffd8ff", 0, "hex")) !== -1) {
					const eoi = buf.indexOf("ffd9", soi + 3, "hex");
					if (eoi === -1) break;
					const frame = buf.subarray(soi, eoi + 2);
					if (frame.length > 2048) newest = Buffer.from(frame);
					buf = buf.subarray(eoi + 2);
				}
				if (newest) {
					s.frame = newest;
					s.ts = Date.now();
					for (const res of s.subs) this.writeFrame(res, newest);
				}
				if (buf.length > 4_000_000) buf = buf.subarray(buf.length - 1_000_000);
			}
			throw new Error("stream ended");
		} catch (e) {
			/* reconnect below */
		}
		s.connected = false;
		s.abort = null;
		clearTimeout(s.timer);
		if (this.wanted.has(ent) || (this.streams[ent] && this.streams[ent].subs.size)) {
			s.timer = setTimeout(() => this.connect(ent), RECONNECT_MS);
		}
	},

	close (ent) {
		const s = this.streams[ent];
		if (!s) return;
		clearTimeout(s.timer);
		if (s.abort) { try { s.abort.abort(); } catch (e) { /* */ } }
		for (const res of s.subs) { try { res.end(); } catch (e) { /* */ } }
		delete this.streams[ent];
	},

	writeFrame (res, frame) {
		// drop this frame for a viewer whose socket is still draining the last one —
		// this is what keeps the picture live instead of playing a growing backlog
		if (res._camwBusy) return;
		try {
			res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
			res.write(frame);
			const ok = res.write("\r\n");
			if (!ok) {
				res._camwBusy = true;
				res.once("drain", () => { res._camwBusy = false; });
			}
		} catch (e) { /* subscriber gone */ }
	}
});
