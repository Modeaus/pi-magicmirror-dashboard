/* MMM-HourlyChart — horizontal hourly weather chart (temperature curve +
 * per-hour condition icon + precipitation-probability bars + hour labels),
 * in the spirit of the HA "weather card with chart".
 * Data: NWS gridpoints hourly forecast, via node_helper.
 */
Module.register("MMM-HourlyChart", {
	defaults: {
		grid: "OKX/33,35",   // NWS gridpoint — see api.weather.gov/points/<lat>,<lon> ; override in config
		hours: 12,
		updateMinutes: 20,
		header: "Next 12 Hours"
	},

	getStyles () {
		return [
			"MMM-HourlyChart.css",
			"modules/MMM-homeassistant-sensors/node_modules/@mdi/font/css/materialdesignicons.min.css"
		];
	},

	start () {
		this.data.header = this.config.header;
		this.periods = null;
		this.ok = true;
		this.sendSocketNotification("HOURLYCHART_CONFIG", {
			grid: this.config.grid,
			hours: this.config.hours,
			updateMinutes: this.config.updateMinutes
		});
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "HOURLYCHART_DATA") return;
		// keep showing the last good data if a later poll fails
		if (payload.ok) { this.periods = payload.periods; this.ok = true; }
		else { this.ok = false; }
		this.updateDom(300);
	},

	// Material Design Icons glyphs (font served via @mdi/font); Private-Use codepoints
	icon (short, day) {
		const s = (short || "").toLowerCase();
		const sunny = "\u{F0599}";
		const night = "\u{F0594}";
		const partly = "\u{F0595}";
		const cloudy = "\u{F0590}";
		const pouring = "\u{F0596}";
		const lightning = "\u{F0593}";
		const fog = "\u{F0591}";
		const snowy = "\u{F0598}";
		const snowyRainy = "\u{F067F}";
		if (/thunder|lightning/.test(s)) return lightning;
		if (/snow|flurr|blizzard|wintry/.test(s)) return snowy;
		if (/sleet|freezing|ice/.test(s)) return snowyRainy;
		if (/rain|shower|drizzle/.test(s)) return pouring;
		if (/fog|haze|mist|smoke/.test(s)) return fog;
		if (/partly|mostly sunny|mostly clear|few clouds/.test(s)) return day ? partly : cloudy;
		if (/cloud|overcast/.test(s)) return cloudy;
		if (/sun|clear|fair|hot/.test(s)) return day ? sunny : night;
		return day ? sunny : night;
	},

	hourLabel (iso) {
		const h = new Date(iso).getHours();
		const ap = h < 12 ? "a" : "p";
		let hh = h % 12;
		if (hh === 0) hh = 12;
		return hh + ap;
	},

	svgEl (name, attrs) {
		const el = document.createElementNS("http://www.w3.org/2000/svg", name);
		for (const k in attrs) el.setAttribute(k, attrs[k]);
		return el;
	},

	getDom () {
		const wrap = document.createElement("div");
		wrap.className = "hourlychart";

		if (this.periods === null || !this.periods.length) {
			wrap.textContent = "Loading…";
			return wrap;
		}

		const P = this.periods;
		const N = P.length;
		const W = 680;
		const H = 270;
		const mx = 26;
		const top = 52;
		const curveH = 96;
		const precipTop = 178;
		const precipH = 44;
		const labelY = 256;
		const step = (W - 2 * mx) / (N - 1);
		const x = (i) => mx + i * step;

		const temps = P.map((p) => p.temp);
		let tmin = Math.min(...temps);
		let tmax = Math.max(...temps);
		if (tmax - tmin < 6) { tmax += 3; tmin -= 3; }
		const yT = (t) => top + curveH - ((t - tmin) / (tmax - tmin)) * curveH;

		const svg = this.svgEl("svg", {
			viewBox: `0 0 ${W} ${H}`,
			class: "hc-svg",
			preserveAspectRatio: "xMidYMid meet"
		});

		// precipitation-probability bars
		P.forEach((p, i) => {
			if (!p.pop) return;
			const bh = (p.pop / 100) * precipH;
			svg.appendChild(this.svgEl("rect", {
				x: x(i) - step * 0.28,
				y: precipTop + (precipH - bh),
				width: step * 0.56,
				height: bh,
				rx: 2,
				class: "hc-precip"
			}));
			if (p.pop >= 20) {
				const t = this.svgEl("text", { x: x(i), y: precipTop - 4, class: "hc-precip-label" });
				t.textContent = p.pop + "%";
				svg.appendChild(t);
			}
		});

		// smooth temperature path
		const pts = P.map((p, i) => [x(i), yT(p.temp)]);
		let d = `M ${pts[0][0]} ${pts[0][1]}`;
		for (let i = 0; i < pts.length - 1; i++) {
			const [x0, y0] = pts[i];
			const [x1, y1] = pts[i + 1];
			const xm = (x0 + x1) / 2;
			d += ` C ${xm} ${y0} ${xm} ${y1} ${x1} ${y1}`;
		}
		svg.appendChild(this.svgEl("path", { d, class: "hc-line" }));

		// points + temp labels + condition icons + hour labels
		P.forEach((p, i) => {
			svg.appendChild(this.svgEl("circle", { cx: x(i), cy: yT(p.temp), r: 3, class: "hc-dot" }));

			const tl = this.svgEl("text", { x: x(i), y: yT(p.temp) - 11, class: "hc-temp" });
			tl.textContent = Math.round(p.temp) + "°";
			svg.appendChild(tl);

			const ic = this.svgEl("text", { x: x(i), y: top - 27, class: "hc-icon" });
			ic.textContent = this.icon(p.short, p.day);
			svg.appendChild(ic);

			const hl = this.svgEl("text", { x: x(i), y: labelY, class: "hc-hour" });
			hl.textContent = this.hourLabel(p.time);
			svg.appendChild(hl);
		});

		wrap.appendChild(svg);
		return wrap;
	}
});
