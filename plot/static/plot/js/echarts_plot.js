// Wait until the HTML page is fully loaded.
document.addEventListener('DOMContentLoaded', function () {
	var POLL_INTERVAL_MS = 5000;

	// Find the main container from the template.
	var mainContainer = document.getElementById('main');

	// Stop early if the container is missing.
	if (!mainContainer) {
		return;
	}

	var chartsByNode = {};
	var inFlight = false;

	function ensureChartForSensor(sensor) {
		var nodeKey = String(sensor.node);
		if (chartsByNode[nodeKey]) {
			return chartsByNode[nodeKey];
		}

		var sensorWrapper = document.createElement('div');
		sensorWrapper.style.marginBottom = '24px';

		var sensorTitle = document.createElement('h3');
		sensorTitle.textContent = 'Sensor ' + sensor.node;
		sensorTitle.style.margin = '0 0 8px 0';
		sensorWrapper.appendChild(sensorTitle);

		var chartElement = document.createElement('div');
		chartElement.style.width = '100%';
		chartElement.style.height = '320px';
		sensorWrapper.appendChild(chartElement);

		mainContainer.appendChild(sensorWrapper);

		var sensorChart = echarts.init(chartElement);
		chartsByNode[nodeKey] = sensorChart;
		return sensorChart;
	}

	function updateChart(sensorChart, sensor) {
		var option = {
			tooltip: { trigger: 'axis' },
			xAxis: {
				type: 'category',
				data: sensor.dates || []
			},
			yAxis: {
				type: 'value',
				name: '°C'
			},
			series: [
				{
					name: 'Temperature',
					type: 'line',
					data: sensor.temperatures || [],
					smooth: true
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
	setInterval(loadAndRender, POLL_INTERVAL_MS);

	window.addEventListener('resize', function () {
		Object.keys(chartsByNode).forEach(function (nodeKey) {
			chartsByNode[nodeKey].resize();
		});
	});
});
