/* MMM-WeatherWallpaper — sets a full-screen background photo based on the current
 * weather type broadcast by the default `weather` module (notification
 * "CURRENTWEATHER_TYPE", payload { type: "<weathericon-type>" }).
 * Keys match the openmeteo provider's day/night weathericon names (with "-" -> "_").
 * Images (pre-darkened) live in this module's img/ folder.
 * Lightweight: no polling, no node_helper. Sets html/body background directly.
 */
Module.register("MMM-WeatherWallpaper", {
	defaults: {
		fade: 1500, // ms
		fallback: "overcast.jpg",
		map: {
			// clear
			day_sunny: "sunny.jpg",
			night_clear: "night.jpg",
			// clouds
			day_cloudy: "overcast.jpg",
			day_sunny_overcast: "overcast.jpg",
			night_alt_cloudy: "night.jpg",
			night_alt_partly_cloudy: "night.jpg",
			// fog
			day_fog: "fog.jpg",
			night_fog: "fog.jpg",
			// rain / drizzle / showers / thunderstorm
			day_sprinkle: "rain.jpg",
			night_sprinkle: "rain.jpg",
			day_showers: "rain.jpg",
			night_showers: "rain.jpg",
			day_thunderstorm: "rain.jpg",
			night_thunderstorm: "rain.jpg",
			// wintry mix / snow / sleet
			day_rain_mix: "snow.jpg",
			night_rain_mix: "snow.jpg",
			day_sleet: "snow.jpg",
			night_sleet: "snow.jpg",
			day_sleet_storm: "snow.jpg",
			night_sleet_storm: "snow.jpg",
			day_snow_wind: "snow.jpg",
			night_snow_wind: "snow.jpg",
			day_snow_thunderstorm: "snow.jpg",
			night_snow_thunderstorm: "snow.jpg"
		}
	},

	start() {
		const st = document.createElement("style");
		st.textContent = `
			html {
				background-color: #000 !important;
				background-repeat: no-repeat !important;
				background-attachment: fixed !important;
				background-position: center center !important;
				background-size: cover !important;
				transition: background-image ${this.config.fade}ms ease-in-out;
			}
			body { background: transparent !important; }`;
		document.head.appendChild(st);
		this.setImage(this.config.fallback);
	},

	setImage(file) {
		if (!file || file === this._current) return;
		this._current = file;
		const url = this.file("img/" + file);
		const pre = new Image();
		pre.onload = () => { document.documentElement.style.backgroundImage = `url("${url}")`; };
		pre.onerror = () => Log.error(`[MMM-WeatherWallpaper] failed to load ${url}`);
		pre.src = url;
	},

	notificationReceived(notification, payload) {
		if (notification === "CURRENTWEATHER_TYPE" && payload && payload.type) {
			const key = String(payload.type).replace(/-/g, "_");
			this.setImage(this.config.map[key] || this.config.fallback);
			Log.info(`[MMM-WeatherWallpaper] type "${payload.type}" -> ${this.config.map[key] || this.config.fallback}`);
		}
	},

	getDom() {
		return document.createElement("div");
	}
});
