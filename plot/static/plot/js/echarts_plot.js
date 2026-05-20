// Wait until the HTML page is fully loaded.
document.addEventListener('DOMContentLoaded', function () {
	var POLL_INTERVAL_MS = 10000;

	// Find the main container from the template.
	var mainContainer = document.getElementById('main');

	// Stop early if the container is missing.
	if (!mainContainer) {
		return;
	}

	// Keep one ECharts instance per node so we can update it in-place.
	var chartsByNode = {};
	// Keep a small right-side info panel per node (DOM element).
	var infoByNode = {};
	var inFlight = false;

	function ensureChartForSensor(sensor) {
		var nodeKey = String(sensor.node);
		if (chartsByNode[nodeKey]) {
			return chartsByNode[nodeKey];
		}

		var sensorWrapper = document.createElement('div');
		sensorWrapper.style.marginBottom = '24px';

		// Layout: chart on the left, "current value" panel on the right.
		var row = document.createElement('div');
		row.style.display = 'flex';
		row.style.alignItems = 'stretch';
		row.style.gap = '16px';
		sensorWrapper.appendChild(row);

		var chartElement = document.createElement('div');
		chartElement.style.flex = '1';
		chartElement.style.minWidth = '0';
		chartElement.style.height = '500px';
		row.appendChild(chartElement);

		var infoPanel = document.createElement('div');
		infoPanel.style.width = '160px';
		infoPanel.style.display = 'flex';
		infoPanel.style.flexDirection = 'column';
		infoPanel.style.justifyContent = 'center';
		infoPanel.style.textAlign = 'left';
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
		infoTime.style.fontSize = '12px';
		infoTime.style.opacity = '0.8';
		infoTime.style.whiteSpace = 'pre-line';
		infoTime.textContent = '';
		infoPanel.appendChild(infoTime);

		infoByNode[nodeKey] = {
			root: infoPanel,
			sensorEl: infoSensor,
			tempEl: infoTemp,
			timeEl: infoTime
		};

		mainContainer.appendChild(sensorWrapper);

		var sensorChart = echarts.init(chartElement);
		chartsByNode[nodeKey] = sensorChart;
		return sensorChart;
	}

	function updateInfoPanel(sensor) {
		var nodeKey = String(sensor.node);
		var info = infoByNode[nodeKey];
		if (!info) {
			return;
		}

		var temps = sensor.temperatures || [];
		var dates = sensor.dates || [];
		var lastTemp = temps.length ? temps[temps.length - 1] : null;
		var lastDate = dates.length ? dates[dates.length - 1] : '';

		info.sensorEl.textContent = 'Sensor ' + sensor.node;
		info.tempEl.textContent = lastTemp === null || lastTemp === undefined ? '-- °C' : String(lastTemp) + ' °C';
		if (info.timeEl) {
			if (!lastDate) {
				info.timeEl.textContent = '';
			} else {
				var d = new Date(lastDate);
				var datePart = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' , year: '2-digit' });
				var timePart = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
				info.timeEl.textContent = datePart + '\n' + timePart;
			}
		}
		// Optional: show timestamp as tooltip on hover.
		info.root.title = lastDate ? ('Last update: ' + lastDate) : '';
	}

	function updateChart(sensorChart, sensor) {
		var HOURS_48_MS = 48 * 60 * 60 * 1000;

		var rawDates = sensor.dates || [];
		var rawTemps = sensor.temperatures || [];
		var lastDateMs = rawDates.length ? new Date(rawDates[rawDates.length - 1]).getTime() : NaN;
		var cutoffMs = isNaN(lastDateMs) ? -Infinity : (lastDateMs - HOURS_48_MS);

		// Default zoom window: last 48 hours (as a percentage of all data).
		var startIndex = 0;
		for (var i = 0; i < rawDates.length; i++) {
			if (new Date(rawDates[i]).getTime() >= cutoffMs) {
				startIndex = i;
				break;
			}
		}
		var startPercent = rawDates.length > 1 ? (startIndex / rawDates.length * 100) : 0;

		var option = {
			tooltip: { trigger: 'axis' },
			xAxis: {
				type: 'category',
				data: rawDates,
				name: 'Time',
			},
			yAxis: {
				type: 'value',
				name: 'Temperature in °C'
			},
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

	function loadAndRender() {
		if (inFlight) {
			return;
		}
		inFlight = true;

		// Poll the Django endpoint and refresh the charts.
		fetch('/temperature-data/')
			.then(function (response) {
				return response.json();
			})
			.then(function (json) {
				var sensors = json.sensors || [];

				if (sensors.length === 0) {
					if (Object.keys(chartsByNode).length === 0) {
						mainContainer.textContent = 'No sensor data available.';
					}
					return;
				}

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
			.finally(function () {
				inFlight = false;
			});
	}

	loadAndRender();
	// Simple auto-refresh: re-fetch data every N milliseconds.
	setInterval(loadAndRender, POLL_INTERVAL_MS);

	window.addEventListener('resize', function () {
		Object.keys(chartsByNode).forEach(function (nodeKey) {
			chartsByNode[nodeKey].resize();
		});
	});
});
