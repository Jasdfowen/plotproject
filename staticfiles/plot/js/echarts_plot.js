document.addEventListener('DOMContentLoaded', function () {

	// ── Constants ────────────────────────────────────────────────────────────

	var POLL_INTERVAL_MS = 10000;   // how often to re-fetch data from the server
	var HOURS_48_MS      = 48 * 60 * 60 * 1000;  // default zoom window width

	// ── State ────────────────────────────────────────────────────────────────

	var mainContainer = document.getElementById('main');
	if (!mainContainer) { return; }

	var chartsByNode = {};   // nodeKey → ECharts instance
	var infoByNode   = {};   // nodeKey → sidebar DOM references
	var inFlight     = false; // prevents overlapping fetches

	// ── Helpers ──────────────────────────────────────────────────────────────

	// Converts an ISO timestamp string to "DD.MM HH:mm" for axis labels.
	// Example: "2026-04-29T20:17:54+00:00" → "29.04 20:17"
	function formatDate(isoString) {
		var d = new Date(isoString);
		var dd   = String(d.getDate()).padStart(2, '0');
		var mm   = String(d.getMonth() + 1).padStart(2, '0');
		var hh   = String(d.getHours()).padStart(2, '0');
		var min  = String(d.getMinutes()).padStart(2, '0');
		return dd + '.' + mm + ' ' + hh + ':' + min;
	}

	// ── DOM builders ─────────────────────────────────────────────────────────

	// Creates the chart + sidebar row for a sensor the first time it is seen,
	// stores references in chartsByNode / infoByNode, and returns the chart instance.
	function ensureChartForSensor(sensor) {
		var nodeKey = String(sensor.node);
		if (chartsByNode[nodeKey]) {
			return chartsByNode[nodeKey];
		}

		// Outer wrapper gives vertical spacing between sensors.
		var sensorWrapper = document.createElement('div');
		sensorWrapper.style.marginBottom = '24px';

		// Row: chart (flexible width) + sidebar (fixed width).
		var row = document.createElement('div');
		row.style.display    = 'flex';
		row.style.alignItems = 'stretch';
		row.style.gap        = '16px';
		sensorWrapper.appendChild(row);

		// Chart area — grows to fill available width.
		var chartElement = document.createElement('div');
		chartElement.style.flex      = '1';
		chartElement.style.minWidth  = '0';
		chartElement.style.height    = '500px';
		row.appendChild(chartElement);

		// Sidebar — shows the most recent reading.
		var infoPanel = document.createElement('div');
		infoPanel.style.width          = '160px';
		infoPanel.style.display        = 'flex';
		infoPanel.style.flexDirection  = 'column';
		infoPanel.style.justifyContent = 'center';
		infoPanel.style.textAlign      = 'left';
		row.appendChild(infoPanel);

		var infoSensor = document.createElement('div');
		infoSensor.style.fontWeight = '600';
		infoSensor.textContent = 'Sensor ' + sensor.node;
		infoPanel.appendChild(infoSensor);

		var infoTemp = document.createElement('div');
		infoTemp.style.fontSize = '20px';
		infoTemp.textContent = '-- °C';
		infoPanel.appendChild(infoTemp);

		var infoTime = document.createElement('div');
		infoTime.style.fontSize    = '12px';
		infoTime.style.opacity     = '0.8';
		infoTime.style.whiteSpace  = 'pre-line';
		infoTime.textContent = '';
		infoPanel.appendChild(infoTime);

		infoByNode[nodeKey] = {
			root:     infoPanel,
			sensorEl: infoSensor,
			tempEl:   infoTemp,
			timeEl:   infoTime
		};

		mainContainer.appendChild(sensorWrapper);

		var sensorChart = echarts.init(chartElement);
		chartsByNode[nodeKey] = sensorChart;
		return sensorChart;
	}

	// ── Update functions ─────────────────────────────────────────────────────

	// Refreshes the sidebar panel with the latest temperature and timestamp.
	function updateInfoPanel(sensor) {
		var nodeKey = String(sensor.node);
		var info = infoByNode[nodeKey];
		if (!info) { return; }

		var temps    = sensor.temperatures || [];
		var dates    = sensor.dates        || [];
		var lastTemp = temps.length ? temps[temps.length - 1] : null;
		var lastDate = dates.length ? dates[dates.length - 1] : '';

		info.sensorEl.textContent = 'Sensor ' + sensor.node;
		info.tempEl.textContent   = (lastTemp == null) ? '-- °C' : lastTemp + ' °C';

		if (lastDate) {
			var d        = new Date(lastDate);
			var datePart = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
			var timePart = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
			info.timeEl.textContent = datePart + '\n' + timePart;
		} else {
			info.timeEl.textContent = '';
		}

		// Full ISO string shown on hover for precision.
		info.root.title = lastDate ? ('Last update: ' + lastDate) : '';
	}

	// Rebuilds the ECharts option for one sensor and applies it.
	function updateChart(sensorChart, sensor) {
		var rawDates = sensor.dates        || [];
		var rawTemps = sensor.temperatures || [];

		// Format ISO timestamps into readable "DD.MM HH:mm" labels for the x-axis.
		var labels = rawDates.map(formatDate);

		// Find the index of the oldest point still inside the 48-hour window
		// so we can set the initial zoom to show only the most recent data.
		var lastDateMs = rawDates.length ? new Date(rawDates[rawDates.length - 1]).getTime() : NaN;
		var cutoffMs   = isNaN(lastDateMs) ? -Infinity : (lastDateMs - HOURS_48_MS);

		var startIndex = 0;
		for (var i = 0; i < rawDates.length; i++) {
			if (new Date(rawDates[i]).getTime() >= cutoffMs) {
				startIndex = i;
				break;
			}
		}

		// Convert the start index to a percentage (0–100) for ECharts dataZoom.
		var startPercent = rawDates.length > 1 ? (startIndex / rawDates.length * 100) : 0;

		var option = {
			tooltip: { trigger: 'axis' },
			xAxis: {
				type: 'category',
				data: labels,        // human-readable labels shown on the axis
				name: 'Time',
				axisLabel: { rotate: 30 }  // slight tilt avoids overlap on dense data
			},
			yAxis: {
				type: 'value',
				name: 'Temperature in °C'
			},
			// Slider below the chart + mouse-wheel zoom inside the chart area.
			dataZoom: [
				{ type: 'slider', start: startPercent, end: 100 },
				{ type: 'inside' }
			],
			series: [
				{
					name: 'Temperature',
					type: 'line',
					data: rawTemps,
					smooth: true,
					showSymbol: false
				}
			]
		};

		sensorChart.setOption(option, true);
	}

	// ── Data fetching ─────────────────────────────────────────────────────────

	// Fetches fresh data from the Django API and updates every chart.
	// Skips the call if a previous fetch is still in progress.
	function loadAndRender() {
		if (inFlight) { return; }
		inFlight = true;

		fetch('/temperature-data/')
			.then(function (response) { return response.json(); })
			.then(function (json) {
				var sensors = json.sensors || [];

				if (sensors.length === 0) {
					if (Object.keys(chartsByNode).length === 0) {
						mainContainer.textContent = 'No sensor data available.';
					}
					return;
				}

				// Clear the placeholder text before inserting the first chart.
				if (Object.keys(chartsByNode).length === 0) {
					mainContainer.innerHTML = '';
				}

				sensors.forEach(function (sensor) {
					var sensorChart = ensureChartForSensor(sensor);
					updateChart(sensorChart, sensor);
					updateInfoPanel(sensor);
				});
			})
			.catch(function () {
				if (Object.keys(chartsByNode).length === 0) {
					mainContainer.textContent = 'Failed to load sensor data.';
				}
			})
			.finally(function () { inFlight = false; });
	}

	// ── Init ──────────────────────────────────────────────────────────────────

	loadAndRender();
	setInterval(loadAndRender, POLL_INTERVAL_MS);

	// Resize all charts when the browser window changes size.
	window.addEventListener('resize', function () {
		Object.keys(chartsByNode).forEach(function (nodeKey) {
			chartsByNode[nodeKey].resize();
		});
	});

});
