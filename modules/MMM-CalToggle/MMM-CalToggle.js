/* MMM-CalToggle — a tappable pill that switches the calendar between the
 * "2-day" view and the "week" view. It just toggles a class on <body>; the two
 * calendar module instances (classes calview-2day / calview-week) are shown or
 * hidden by custom.css. Choice is remembered in localStorage.
 */
Module.register("MMM-CalToggle", {
	defaults: {
		labels: { day: "TODAY", week: "THIS WEEK" },
		startWeek: false
	},

	start() {
		let saved = null;
		try { saved = localStorage.getItem("calview"); } catch (e) { /* ignore */ }
		this.week = saved ? saved === "week" : this.config.startWeek;
		this.apply();
	},

	apply() {
		document.body.classList.toggle("calview-week-active", this.week);
		try { localStorage.setItem("calview", this.week ? "week" : "day"); } catch (e) { /* ignore */ }
		const btn = document.querySelector(".caltoggle-pill");
		if (btn) btn.textContent = this.week ? this.config.labels.week : this.config.labels.day;
	},

	getDom() {
		const wrap = document.createElement("div");
		wrap.className = "caltoggle";
		const pill = document.createElement("div");
		pill.className = "caltoggle-pill";
		pill.textContent = this.week ? this.config.labels.week : this.config.labels.day;
		pill.addEventListener("click", () => {
			this.week = !this.week;
			this.apply();
		});
		wrap.appendChild(pill);
		return wrap;
	}
});
