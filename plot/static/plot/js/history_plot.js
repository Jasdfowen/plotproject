/*
 * history_plot.js — Historische Verlaufsansicht
 * =============================================
 *
 * Anders als das Live-Dashboard (echarts_plot.js) pollt diese Seite NICHT.
 * Der Nutzer wählt einen Zeitraum (Von/Bis), klickt "LADEN", und die Daten
 * werden einmalig von /history-data/ geholt und in ein großes Chart gezeichnet.
 * Über den Zoom-Slider und das Mausrad (dataZoom) lässt sich der Zeitraum frei
 * erkunden, ohne dass sich die Daten unter der Hand ändern.
 */
document.addEventListener('DOMContentLoaded', function () {

	// Gleiche Palette wie im Dashboard, damit Sensoren wiedererkennbar bleiben.
	var COLORS = ['#0091b8', '#1a9850', '#d98c00', '#d12f2f', '#7d4fc9',
	              '#c43d8e', '#0fa68c', '#b08900', '#3d72d1', '#cc6f1f'];

	var AXIS_LABEL = '#7c8a96';
	var GRID_LINE  = '#e2e7eb';

	var chartEl    = document.getElementById('historyChart');
	var startInput = document.getElementById('startInput');
	var endInput   = document.getElementById('endInput');
	var loadBtn    = document.getElementById('loadBtn');
	var statusEl   = document.getElementById('status');

	if (!chartEl) { return; }
	var chart = echarts.init(chartEl);

	// ── Hilfsfunktionen ──────────────────────────────────────────────────────

	function pad(n) { return String(n).padStart(2, '0'); }

	// Formatiert ein Date für ein <input type="datetime-local"> ("YYYY-MM-DDTHH:MM",
	// in lokaler Zeit, ohne Zeitzone — genau das erwartet das Eingabefeld).
	function toLocalInput(date) {
		return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
			+ 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
	}

	// Kurzname eines Sensors: vergebener Name oder Fallback "S03".
	function sensorLabel(s) { return s.name || ('S' + pad(s.node)); }

	// Wandelt die API-Daten in [zeit_ms, temperatur]-Paare für ECharts um.
	function toSeriesData(s) {
		return (s.dates || []).map(function (d, i) {
			return [new Date(d).getTime(), s.temperatures[i]];
		});
	}

	// ── Chart-Konfiguration ──────────────────────────────────────────────────

	function buildOption(sensors) {
		var series = sensors.map(function (s, i) {
			var color = COLORS[i % COLORS.length];
			return {
				name: sensorLabel(s),
				type: 'line',
				smooth: false,
				showSymbol: false,
				lineStyle: { width: 1.5, color: color },
				itemStyle: { color: color },
				data: toSeriesData(s)
			};
		});

		return {
			animation: false,
			grid:   { left: 48, right: 24, top: 44, bottom: 74 },
			legend: {
				top: 8,
				textStyle: { color: '#4a5a68', fontFamily: 'JetBrains Mono', fontSize: 10 }
			},
			tooltip: {
				trigger: 'axis',
				backgroundColor: '#ffffff',
				borderColor: '#d3dae0',
				textStyle: { color: '#1e2630', fontFamily: 'JetBrains Mono', fontSize: 11 }
			},
			xAxis: {
				type: 'time',
				axisLabel: { color: AXIS_LABEL, fontSize: 10, fontFamily: 'JetBrains Mono' },
				axisLine:  { lineStyle: { color: '#d3dae0' } },
				axisTick:  { show: false },
				splitLine: { show: false }
			},
			yAxis: {
				type: 'value',
				axisLabel: { color: AXIS_LABEL, fontSize: 10, fontFamily: 'JetBrains Mono',
				             formatter: function (v) { return v + '°'; } },
				axisLine:  { show: false },
				axisTick:  { show: false },
				splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } }
			},
			// Zwei Zoom-Wege: Mausrad/Ziehen direkt im Chart (inside) + Slider unten.
			dataZoom: [
				{ type: 'inside' },
				{ type: 'slider', height: 22, bottom: 24,
				  borderColor: '#d3dae0', fillerColor: 'rgba(0,145,184,0.12)',
				  textStyle: { color: AXIS_LABEL, fontFamily: 'JetBrains Mono', fontSize: 9 } }
			],
			series: series
		};
	}

	// ── Laden + Zeichnen ──────────────────────────────────────────────────────

	// Liest die Eingaben, holt die Daten des Zeitraums und zeichnet das Chart.
	function load() {
		// Eingaben (lokale Zeit) in echte Zeitpunkte wandeln und als UTC-ISO senden,
		// damit Server und Browser denselben Moment meinen.
		var startVal = startInput.value ? new Date(startInput.value) : null;
		var endVal   = endInput.value   ? new Date(endInput.value)   : null;

		var params = [];
		if (startVal && !isNaN(startVal)) { params.push('start=' + encodeURIComponent(startVal.toISOString())); }
		if (endVal   && !isNaN(endVal))   { params.push('end='   + encodeURIComponent(endVal.toISOString())); }

		statusEl.textContent = 'Lädt …';
		loadBtn.disabled = true;

		fetch('/history-data/' + (params.length ? '?' + params.join('&') : ''))
			.then(function (r) { return r.json(); })
			.then(function (json) {
				var sensors = json.sensors || [];
				chart.setOption(buildOption(sensors), { replaceMerge: ['series'] });

				var points = sensors.reduce(function (a, s) { return a + (s.dates || []).length; }, 0);
				statusEl.textContent = points
					? (sensors.length + ' Sensoren · ' + points + ' Messwerte')
					: 'Keine Daten im gewählten Zeitraum.';
			})
			.catch(function () { statusEl.textContent = 'Fehler beim Laden.'; })
			.finally(function () { loadBtn.disabled = false; });
	}

	// ── Initialisierung ───────────────────────────────────────────────────────

	// Standard-Zeitraum: die letzten 24 Stunden.
	var now = new Date();
	endInput.value   = toLocalInput(now);
	startInput.value = toLocalInput(new Date(now.getTime() - 24 * 60 * 60 * 1000));

	loadBtn.addEventListener('click', load);
	load();   // einmal beim Öffnen laden

	window.addEventListener('resize', function () { chart.resize(); });
});
