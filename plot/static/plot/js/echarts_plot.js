document.addEventListener('DOMContentLoaded', function () {

	// ── Constants ────────────────────────────────────────────────────────────

	var POLL_INTERVAL_MS  = 10000;
	var DEFAULT_WINDOW_MS = 48 * 60 * 60 * 1000;   // initial zoom window width

	// ── State ────────────────────────────────────────────────────────────────

	var mainContainer = document.getElementById('main');
	if (!mainContainer) { return; }

	var chartsByNode = {};    // nodeKey → ECharts instance
	var infoByNode   = {};    // nodeKey → sidebar DOM references
	var inFlight     = false; // guards against overlapping fetches

	// ── Helpers ──────────────────────────────────────────────────────────────

	// x-axis tick label: time only, or "DD.MM\nHH:mm" at midnight to mark a new day.
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

	// [timestamp, value] pairs for the time-axis line series.
	function toSeriesData(sensor) {
		var dates = sensor.dates        || [];
		var temps = sensor.temperatures || [];
		return dates.map(function (d, i) { return [d, temps[i]]; });
	}

	// Last timestamp of a sensor as ms, or NaN when there is no data.
	function lastTimestampMs(sensor) {
		var dates = sensor.dates || [];
		return dates.length ? new Date(dates[dates.length - 1]).getTime() : NaN;
	}

	// ── Chart + sidebar creation ───────────────────────────────────────────────

	// Builds the chart/sidebar row on first sight of a sensor and returns the
	// chart; reuses the existing instance afterwards. The static option (axes,
	// tooltip, initial 48h zoom) is set here just once — later polls only feed
	// in new data, so the zoom window is never disturbed.
	function ensureChartForSensor(sensor) {
		var nodeKey = String(sensor.node);
		if (chartsByNode[nodeKey]) {
			return chartsByNode[nodeKey];
		}

		// Wrapper + row: chart (flexible width) beside sidebar (fixed width).
		var sensorWrapper = document.createElement('div');
		sensorWrapper.style.marginBottom = '24px';

		var row = document.createElement('div');
		row.style.display    = 'flex';
		row.style.alignItems = 'stretch';
		row.style.gap        = '16px';
		sensorWrapper.appendChild(row);

		var chartElement = document.createElement('div');
		chartElement.style.flex     = '1';
		chartElement.style.minWidth = '0';
		chartElement.style.height   = '500px';
		row.appendChild(chartElement);

		// Sidebar: latest reading for this sensor.
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
		infoTime.style.fontSize   = '12px';
		infoTime.style.opacity    = '0.8';
		infoTime.style.whiteSpace = 'pre-line';
		infoPanel.appendChild(infoTime);

		infoByNode[nodeKey] = {
			root:     infoPanel,
			sensorEl: infoSensor,
			tempEl:   infoTemp,
			timeEl:   infoTime
		};

		mainContainer.appendChild(sensorWrapper);

		var chart  = echarts.init(chartElement);
		var lastMs = lastTimestampMs(sensor);
		chart.setOption({
			tooltip: { trigger: 'axis' },
			xAxis: { type: 'time', name: 'Time', axisLabel: { formatter: formatAxisTick } },
			yAxis: { type: 'value', name: 'Temperature in °C' },
			dataZoom: [
				{ type: 'slider', startValue: isNaN(lastMs) ? undefined : lastMs - DEFAULT_WINDOW_MS, endValue: lastMs },
				{ type: 'inside' }
			],
			series: [{ name: 'Temperature', type: 'line', smooth: true, showSymbol: false, data: [] }]
		});

		chartsByNode[nodeKey] = chart;
		return chart;
	}

	// ── Updates ──────────────────────────────────────────────────────────────

	// Merges the latest readings into the chart; the zoom window is left as-is.
	function updateChart(chart, sensor) {
		chart.setOption({ series: [{ data: toSeriesData(sensor) }] });
	}

	// Refreshes the sidebar with the latest temperature and timestamp.
	function updateInfoPanel(sensor) {
		var info = infoByNode[String(sensor.node)];
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
			info.root.title = 'Last update: ' + lastDate;   // full ISO on hover
		} else {
			info.timeEl.textContent = '';
			info.root.title = '';
		}
	}

	// ── Data loading ───────────────────────────────────────────────────────────

	// Status message shown only while no charts exist yet.
	function showPlaceholder(message) {
		if (Object.keys(chartsByNode).length === 0) {
			mainContainer.textContent = message;
		}
	}

	// Fetches fresh data and updates every sensor; skips if a fetch is in flight.
	function loadAndRender() {
		if (inFlight) { return; }
		inFlight = true;

		fetch('/temperature-data/')
			.then(function (response) { return response.json(); })
			.then(function (json) {
				var sensors = json.sensors || [];

				if (sensors.length === 0) {
					showPlaceholder('No sensor data available.');
					return;
				}

				// Drop the placeholder text before inserting the first chart.
				if (Object.keys(chartsByNode).length === 0) {
					mainContainer.innerHTML = '';
				}

				sensors.forEach(function (sensor) {
					var chart = ensureChartForSensor(sensor);
					updateChart(chart, sensor);
					updateInfoPanel(sensor);
				});
			})
			.catch(function () {
				showPlaceholder('Failed to load sensor data.');
			})
			.finally(function () { inFlight = false; });
	}

	// ── Init ─────────────────────────────────────────────────────────────────

	loadAndRender();
	setInterval(loadAndRender, POLL_INTERVAL_MS);

	// Resize all charts when the browser window changes size.
	window.addEventListener('resize', function () {
		Object.keys(chartsByNode).forEach(function (nodeKey) {
			chartsByNode[nodeKey].resize();
		});
	});

});
