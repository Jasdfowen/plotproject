// Wait until the HTML page is fully loaded.
document.addEventListener('DOMContentLoaded', function () {
	// Find the main container from the template.
	var mainContainer = document.getElementById('main');

	// Stop early if the container is missing.
	if (!mainContainer) {
		return;
	}

	// Request sensor data from Django.
	fetch('/temperature-data/')
		.then(function (response) {
			// Convert the response body to JSON.
			return response.json();
		})
		.then(function (json) {
			// Clear old content so we can insert one chart per sensor.
			mainContainer.innerHTML = '';

			// Read sensors from the API response.
			var sensors = json.sensors || [];

			// Show a fallback message if no sensors are available.
			if (sensors.length === 0) {
				mainContainer.textContent = 'No sensor data available.';
				return;
			}

			// Create one plot block for each sensor node.
			sensors.forEach(function (sensor) {
				// Create a wrapper for title + chart.
				var sensorWrapper = document.createElement('div');
				sensorWrapper.style.marginBottom = '24px';

				// Add a small heading so each plot is clearly labeled.
				var sensorTitle = document.createElement('h3');
				sensorTitle.textContent = 'Sensor ' + sensor.node;
				sensorTitle.style.margin = '0 0 8px 0';
				sensorWrapper.appendChild(sensorTitle);

				// Create the chart element for this single sensor.
				var chartElement = document.createElement('div');
				chartElement.style.width = '100%';
				chartElement.style.height = '320px';
				sensorWrapper.appendChild(chartElement);

				// Add this sensor section to the main container.
				mainContainer.appendChild(sensorWrapper);

				// Initialize ECharts for this chart element.
				var sensorChart = echarts.init(chartElement);

				// Define a simple line chart option for one sensor.
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

				// Render the chart with the option above.
				sensorChart.setOption(option);
			});
		})
		.catch(function () {
			// Show a readable error if loading fails.
			mainContainer.textContent = 'Failed to load sensor data.';
		});
});
