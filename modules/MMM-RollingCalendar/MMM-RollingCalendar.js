/* MMM-RollingCalendar — month-grid calendar for the Calendar page, except
 * the set of weeks shown floats with "today" instead of always starting on
 * the 1st of the calendar month. Default view: the current week sits near
 * the top of the grid (just `lagWeeks` week(s) of recent past above it —
 * past matters less than future here), with the rest of the grid filling
 * forward into upcoming weeks. Full month-grid sized cells throughout, not
 * a compressed multi-week list — the row count is however many fit
 * comfortably at that size (usually 5-6), not "as many as technically fit."
 *
 * Two small watermark-style chevrons (bottom corners, low opacity) jump the
 * view a month at a time: tapping lays out that month the same way (a
 * little of the tail end of the previous month, then the target month
 * filling forward). After `idleReturnMs` with no further taps, snaps back
 * to today's rolling view.
 *
 * Event data comes from a SEPARATE, invisible `calendar` core module
 * instance (classes: "calendar-events-source", hidden via custom.css) that
 * broadcasts CALENDAR_EVENTS with a wide date range. Deliberately not
 * sharing the Home page's calendar instance — that one is capped to a
 * short window for its own "Coming Up" list, too narrow for month
 * navigation.
 */
Module.register("MMM-RollingCalendar", {
	defaults: {
		firstDayOfWeek: "sunday", // "sunday" or "monday"
		lagWeeks: 1,
		idleReturnMs: 60000,
		minRowHeight: 78, // px - keeps cells month-grid sized rather than letting rows compress
		minWeeksShown: 4, // floor, in case the measured height comes back tiny
		maxWeeksShown: 6, // ceiling - this is a month view, not a multi-month list
		fallbackWeeksShown: 5, // used for the very first render, before we can measure
		maxEventsPerDay: 3
	},

	start() {
		this.events = [];
		this.loaded = false;
		this.browsing = false;
		this.anchorDate = new Date();
		this._weeksToShow = this.config.fallbackWeeksShown;
		this._lastMeasuredHeight = null;
		this._idleTimer = null;
		this._refreshTimer = setInterval(() => {
			if (!this.browsing) this.updateDom(300);
		}, 15 * 60 * 1000);
	},

	getStyles() {
		return [
			"MMM-RollingCalendar.css",
			// reuse the MDI icon font already vendored for MMM-homeassistant-sensors
			// rather than pulling in a second copy
			"modules/MMM-homeassistant-sensors/node_modules/@mdi/font/css/materialdesignicons.min.css"
		];
	},

	notificationReceived(notification, payload, sender) {
		if (notification !== "CALENDAR_EVENTS") return;

		// MagicMirror broadcasts CALENDAR_EVENTS from every `calendar` instance,
		// and both the Home page's short "Coming Up" instance and this page's
		// wide calendar-events-source instance land here. Without filtering by
		// sender, whichever one happens to fetch last wins - which was silently
		// truncating future months down to the Home page's ~10-day window.
		// broadcastPastEvents is only set on the wide source instance, so it
		// doubles as a reliable identifier.
		if (!sender || !sender.config || !sender.config.broadcastPastEvents) return;

		this.events = payload || [];
		this.loaded = true;
		this.updateDom(300);
	},

	// ---------- date helpers ----------

	dow(firstDayOfWeek) {
		return firstDayOfWeek === "monday" ? 1 : 0;
	},

	startOfWeek(d) {
		const first = this.dow(this.config.firstDayOfWeek);
		const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		const diff = (x.getDay() - first + 7) % 7;
		x.setDate(x.getDate() - diff);
		return x;
	},

	startOfMonth(d) {
		return new Date(d.getFullYear(), d.getMonth(), 1);
	},

	addDays(d, n) {
		const x = new Date(d);
		x.setDate(x.getDate() + n);
		return x;
	},

	addMonths(d, n) {
		return new Date(d.getFullYear(), d.getMonth() + n, 1);
	},

	endOfMonth(d) {
		return new Date(d.getFullYear(), d.getMonth() + 1, 0); // day 0 of next month = last day of this one
	},

	// how many week-rows a standard month-grid needs for this month, starting
	// at the row containing the 1st through the row containing the last day
	weeksForMonth(d) {
		const start = this.startOfWeek(this.startOfMonth(d));
		const end = this.startOfWeek(this.endOfMonth(d));
		const diffDays = Math.round((end - start) / (24 * 60 * 60 * 1000));
		return diffDays / 7 + 1;
	},

	sameDay(a, b) {
		return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
	},

	weekdayLabels() {
		const first = this.dow(this.config.firstDayOfWeek);
		const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const out = [];
		for (let i = 0; i < 7; i++) out.push(names[(first + i) % 7]);
		return out;
	},

	// ---------- navigation ----------

	shiftMonth(delta) {
		this.anchorDate = this.addMonths(this.browsing ? this.anchorDate : new Date(), delta);
		this.browsing = true;
		this.armIdleReturn();
		this.updateDom(200);
	},

	armIdleReturn() {
		if (this._idleTimer) clearTimeout(this._idleTimer);
		this._idleTimer = setTimeout(() => {
			this.browsing = false;
			this.anchorDate = new Date();
			this.updateDom(300);
		}, this.config.idleReturnMs);
	},

	// ---------- rendering ----------

	firstRowStart() {
		if (this.browsing) {
			// standard whole-month grid: starts exactly at the row containing
			// the 1st of the month, no lag week - see weeksForMonth() for the
			// matching row count
			return this.startOfWeek(this.startOfMonth(this.anchorDate));
		}
		return this.addDays(this.startOfWeek(new Date()), -this.config.lagWeeks * 7);
	},

	eventsForDay(day) {
		const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
		const dayEnd = dayStart + 24 * 60 * 60 * 1000;
		return this.events.filter((e) => {
			const s = e.startDate ? Number(e.startDate) : null;
			const en = e.endDate ? Number(e.endDate) : s;
			if (s === null) return false;
			return s < dayEnd && en >= dayStart;
		});
	},

	renderDayCell(day, today) {
		const cell = document.createElement("div");
		const isToday = this.sameDay(day, today);
		const isFirstOfMonth = day.getDate() === 1;
		cell.className = "rollingcal-day"
			+ (isToday ? " rollingcal-day-today" : "")
			+ (isFirstOfMonth ? " rollingcal-day-first" : "");

		const num = document.createElement("div");
		num.className = "rollingcal-day-num";
		// show the month abbreviation whenever a cell is the 1st of a month,
		// so a row that crosses a month boundary stays unambiguous without a
		// separate label column
		num.textContent = day.getDate() === 1
			? day.toLocaleDateString("en-US", { month: "short" }) + " " + day.getDate()
			: String(day.getDate());
		cell.appendChild(num);

		const evs = document.createElement("div");
		evs.className = "rollingcal-day-events";
		const dayEvents = this.eventsForDay(day);
		const shown = dayEvents.slice(0, this.config.maxEventsPerDay);
		for (const e of shown) {
			const chip = document.createElement("div");
			chip.className = "rollingcal-event";
			if (e.color) chip.style.borderLeftColor = e.color;
			chip.textContent = e.title || "(untitled)";
			chip.title = e.title || "";
			evs.appendChild(chip);
		}
		if (dayEvents.length > shown.length) {
			const more = document.createElement("div");
			more.className = "rollingcal-event-more";
			more.textContent = "+" + (dayEvents.length - shown.length) + " more";
			evs.appendChild(more);
		}
		cell.appendChild(evs);
		return cell;
	},

	renderWeekRow(weekStart, isCurrentWeek, today) {
		const row = document.createElement("div");
		row.className = "rollingcal-week" + (isCurrentWeek ? " rollingcal-week-current" : "");
		for (let i = 0; i < 7; i++) {
			row.appendChild(this.renderDayCell(this.addDays(weekStart, i), today));
		}
		return row;
	},

	getDom() {
		const wrap = document.createElement("div");
		wrap.className = "rollingcal";

		const prevBtn = document.createElement("div");
		prevBtn.className = "rollingcal-nav rollingcal-nav-prev mdi mdi-chevron-left";
		prevBtn.addEventListener("click", () => this.shiftMonth(-1));
		wrap.appendChild(prevBtn);

		const nextBtn = document.createElement("div");
		nextBtn.className = "rollingcal-nav rollingcal-nav-next mdi mdi-chevron-right";
		nextBtn.addEventListener("click", () => this.shiftMonth(1));
		wrap.appendChild(nextBtn);

		if (this.browsing) {
			const monthLabel = document.createElement("div");
			monthLabel.className = "rollingcal-month-badge";
			monthLabel.textContent = this.anchorDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
			wrap.appendChild(monthLabel);
		}

		const header = document.createElement("div");
		header.className = "rollingcal-weekday-header";
		for (const label of this.weekdayLabels()) {
			const h = document.createElement("div");
			h.textContent = label;
			header.appendChild(h);
		}
		wrap.appendChild(header);

		const list = document.createElement("div");
		list.className = "rollingcal-weeks" + (this.browsing ? " rollingcal-weeks-browsing" : " rollingcal-weeks-rolling");
		wrap.appendChild(list);

		const today = new Date();
		const todayWeekStart = this.startOfWeek(today).getTime();
		const firstRow = this.firstRowStart();
		// Browsing: however many rows a standard month-grid needs for that
		// month (4-6, whatever it actually takes), shown all at once - never
		// clipped. Rolling: the row count remeasure() already worked out.
		const weeksToRender = this.browsing ? this.weeksForMonth(this.anchorDate) : this._weeksToShow;
		for (let i = 0; i < weeksToRender; i++) {
			const weekStart = this.addDays(firstRow, i * 7);
			list.appendChild(this.renderWeekRow(weekStart, !this.browsing && weekStart.getTime() === todayWeekStart, today));
		}

		if (this.browsing) {
			// Whole month must fit on screen with no clipping/scrolling, so
			// rows get an exact, evenly-divided height instead of a fixed
			// comfortable minimum - a 6-week month is a little more compact
			// than a 4-week one, same as any normal calendar app.
			this.waitForLayout(list, () => this.fitMonthGrid(list, weeksToRender));
		} else {
			// Measure after mount and re-render if a different row count
			// actually fits at the configured minimum comfortable row height.
			this.waitForLayout(list, () => this.remeasure(list));
		}

		return wrap;
	},

	// updateDom() animates old content out before the new getDom() result is
	// actually attached to the live page (more so on the animated updateDom(N)
	// path this module's own click handlers and periodic refresh both use
	// than on the very first, un-animated render) - a plain setTimeout(fn, 0)
	// can fire before that attach happens, at which point getBoundingClientRect()
	// reports everything as zero. Retry across animation frames instead of
	// trusting a fixed delay, until the element is actually laid out.
	waitForLayout(el, cb, attempts) {
		attempts = attempts || 0;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		if (rect.top > 0 || attempts > 30) {
			cb();
			return;
		}
		requestAnimationFrame(() => this.waitForLayout(el, cb, attempts + 1));
	},

	fitMonthGrid(list, weeksToRender) {
		if (!list) return;
		const top = list.getBoundingClientRect().top;
		const available = Math.max(200, window.innerHeight - top - 12);
		list.style.display = "grid";
		list.style.gridTemplateRows = `repeat(${weeksToRender}, 1fr)`;
		list.style.height = available + "px";
	},

	remeasure(list) {
		if (!list || list.children.length === 0) return;
		// MagicMirror's middle_center region doesn't stretch to fill remaining
		// vertical space (it's shrink-to-content, like every other module on
		// this page), so measure against the actual viewport: from where this
		// module starts down to the bottom edge of the screen, minus a margin.
		const top = list.getBoundingClientRect().top;
		const available = window.innerHeight - top - 12;
		const rowHeight = Math.max(list.children[0].getBoundingClientRect().height, this.config.minRowHeight) + 4;
		if (!available || !rowHeight) return;
		if (this._lastMeasuredHeight === available) return; // no real change, avoid re-render loop
		this._lastMeasuredHeight = available;

		let fit = Math.floor(available / rowHeight);
		fit = Math.max(this.config.minWeeksShown, Math.min(this.config.maxWeeksShown, fit));
		if (fit !== this._weeksToShow) {
			this._weeksToShow = fit;
			this.updateDom(0);
		}
	}
});
