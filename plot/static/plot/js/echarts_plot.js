document.addEventListener('DOMContentLoaded', function () {

	// ── Constants ────────────────────────────────────────────────────────────

	var POLL_INTERVAL_MS = 10000;   // how often to re-fetch data from the server
	var HOURS_48_MS      = 48 * 60 * 60 * 1000;  // default zoom window width

	// ── State ────────────────────────────────────────────────────────────────

	var mainContainer = document.getElementById('main');
	if (!mainContainer) { return; }

	var chartsByNode     = {};   // nodeKey → ECharts instance
	var infoByNode       = {};   // nodeKey → sidebar DOM references
	var initializedNodes = {};   // nodeKey → true once the first setOption has run
	var prevLastMsByNode = {};   // nodeKey → lastDateMs from the previous update (used to detect live-end)
	var inFlight         = false; // prevents overlapping fetches

	// ── Helpers ──────────────────────────────────────────────────────────────

	// Formats a timestamp (ms) for x-axis tick labels.
	// Midnight ticks show the date ("29.04\n00:00") so you know when a new day starts;
	// all other ticks show only the time ("14:00").
	function formatAxisTick(timestampMs) {
		var d   = new Date(timestampMs);
		var hh  = String(d.getHours()).padStart(2, '0');
		var min = String(d.getMinutes()).padStart(2, '0');
		if (hh === '00' && min === '00') {
			var dd = String(d.getDate()).padStart(2, '0');
			var mm = String(d.getMonth() + 1).padStart(2, '0');
			return dd + '.' + mm + '\n00:00';
		}
		return hh + ':' + min;
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
		var nodeKey  = String(sensor.node);
		var rawDates = sensor.dates        || [];
		var rawTemps = sensor.temperatures || [];

		// Pair each ISO timestamp with its temperature value.
		// The time axis expects [timestamp, value] pairs.
		var seriesData = rawDates.map(function (d, i) {
			return [d, rawTemps[i]];
		});

		var option = {
			tooltip: { trigger: 'axis' },
			xAxis: {
				type: 'time',   // ECharts picks clean hour/day tick positions automatically
				name: 'Time',
				axisLabel: {
					formatter: formatAxisTick  // "HH:mm" normally, "DD.MM\nHH:mm" at midnight
				}
			},
			yAxis: {
				type: 'value',
				name: 'Temperature in °C'
			},
			series: [
				{
					name: 'Temperature',
					type: 'line',
					data: seriesData,
					smooth: true,
					showSymbol: false
				}
			]
		};

		var lastDateMs = rawDates.length ? new Date(rawDates[rawDates.length - 1]).getTime() : NaN;

		if (!initializedNodes[nodeKey]) {
			// First render: set up the zoom components with a default 48-hour window.
			var cutoffMs = isNaN(lastDateMs) ? undefined : (lastDateMs - HOURS_48_MS);
			option.dataZoom = [
				{ type: 'slider', startValue: cutoffMs, endValue: lastDateMs },
				{ type: 'inside' }
			];
			initializedNodes[nodeKey] = true;
		} else if (!isNaN(lastDateMs)) {
			// Subsequent renders: only follow if the user's window currently shows
			// the latest data point (i.e. they haven't scrolled back in time).
			var currentZoom = sensorChart.getOption().dataZoom;

			if (currentZoom && currentZoom[0]) {
				var currentEnd  = currentZoom[0].endValue;
				var prevLastMs  = prevLastMsByNode[nodeKey] || currentEnd;
				var atLiveEnd   = currentEnd >= prevLastMs; // right edge covers the previous latest point

				if (atLiveEnd) {
					var windowMs = currentEnd - currentZoom[0].startValue;
					option.dataZoom = [
						{ startValue: lastDateMs - windowMs, endValue: lastDateMs },
						{ startValue: lastDateMs - windowMs, endValue: lastDateMs }
					];
				}
				// If not at live end, omit dataZoom entirely — window stays where the user left it.
			}
		}

		prevLastMsByNode[nodeKey] = lastDateMs;

		// notMerge=false merges into the existing option rather than replacing it,
		// which is required for the dataZoom update to work correctly.
		sensorChart.setOption(option, false);
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
