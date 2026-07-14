/*
 * echarts_plot.js — Frontend-Logik der Temperaturüberwachung
 * ============================================================
 *
 * Grobe Funktionsweise:
 *   1. Beim Laden der Seite werden ein Übersichts-Chart (alle Sensoren als Linien)
 *      und pro Sensor eine "Karte" mit Einzel-Chart aufgebaut.
 *   2. Alle 10 Sekunden (POLL_INTERVAL_MS) holt der Browser per fetch() frische
 *      Messdaten von der Django-API /temperature-data/ und zeichnet alles neu.
 *   3. Sensoren, die seit > 10 Minuten nichts gesendet haben, gelten als "offline"
 *      und werden grau bzw. mit OFFLINE-Badge dargestellt.
 *
 * Der gesamte Code liegt in einem DOMContentLoaded-Handler. Dadurch laufen die
 * Funktionen erst, wenn das HTML fertig geladen ist (sonst wären die DOM-Elemente,
 * die wir per getElementById suchen, noch nicht vorhanden).
 */
document.addEventListener('DOMContentLoaded', function () {

	// ── Konfiguration ────────────────────────────────────────────────────────
	// Feste Einstellungen. Hier kannst du Verhalten ändern, ohne die Logik anzufassen.

	var POLL_INTERVAL_MS  = 10000;            // Wie oft neue Daten geholt werden (10 s).
	var OFFLINE_THRESHOLD = 60 * 60 * 1000;   // Ab welcher Funkstille ein Sensor als offline gilt (aktuell 60 Minuten).

	// Auswählbare Zeitfenster für die Buttons oben rechts. "min" = Fensterbreite in Minuten.
	var TIME_PRESETS = [
		{ label: '5 min',  min: 5     },
		{ label: '30 min', min: 30    },
		{ label: '1 h',    min: 60    },
		{ label: '2 h',    min: 120   },
		{ label: '6 h',    min: 60*6  },       
		{ label: '12 h',   min: 60*12 },      
		{ label: '24 h',   min: 60*24 }       
	];
	var DEFAULT_WINDOW_MIN = 30;              // Welches Fenster beim Start aktiv ist (15 min).

	// Farbpalette für die Sensorlinien. Wird der Reihe nach an Sensoren vergeben.
	// Bewusst kräftige Farben, damit sie auf dem hellen Hintergrund gut sichtbar sind.
	var SENSOR_COLORS = ['#0091b8', '#1a9850', '#d98c00', '#d12f2f', '#7d4fc9',
	                     '#c43d8e', '#0fa68c', '#b08900', '#3d72d1', '#cc6f1f'];
	var OFFLINE_LINE = '#c2cad1';             // Graue Linienfarbe für offline-Sensoren.

	var AXIS_LABEL  = '#7c8a96';              // Farbe der Achsenbeschriftung.
	var GRID_LINE   = '#e2e7eb';              // Farbe der waagerechten Hilfslinien.
	var TOOLTIP_BG  = '#ffffff';              // Hintergrund der Tooltip-Box (beim Hovern).

	// ── Zustand (State) ──────────────────────────────────────────────────────
	// Variablen, die sich zur Laufzeit ändern bzw. Referenzen auf DOM-Elemente halten.

	// Container-Elemente aus dem HTML. Hier hängen wir später Charts/Legende/Buttons ein.
	var gridContainer   = document.getElementById('main');          // Gitter für die Sensorkarten.
	var overviewElement = document.getElementById('overviewChart'); // Behälter des Übersichts-Charts.
	var rangeContainer  = document.getElementById('timeRange');     // Behälter der Zeitfenster-Buttons.
	var legendContainer = document.getElementById('overviewLegend');// Behälter der Legende.

	// Wenn die wichtigsten Container fehlen, brechen wir ab (z. B. falsches Template).
	if (!gridContainer || !overviewElement) { return; }

	// Das große Übersichts-Chart wird einmalig erzeugt. echarts.init bindet ECharts an das div.
	var overviewChart = echarts.init(overviewElement);

	// Nachschlage-Objekte ("Maps"): Schlüssel ist immer die Node-Nummer als Text.
	var cardsByNode   = {};   // node → { chart, valueEl, statusEl, root, color } – die Sensorkarten.
	var legendByNode  = {};   // node → { item, swatch }                          – die Legendeneinträge.
	var colorByNode   = {};   // node → Farbe                                     – einmal vergebene Farbe je Sensor.
	var assignedColors = 0;   // Zähler, damit jeder neue Sensor die nächste Farbe bekommt.

	var windowMin   = DEFAULT_WINDOW_MIN;  // Aktuell gewählte Zeitfensterbreite in Minuten.
	var inFlight    = false;               // true, solange ein fetch() läuft (verhindert Überlappung).
	var lastSensors = [];                  // Zuletzt empfangene Sensordaten (für erneutes Zeichnen ohne neuen fetch).
	var hiddenNodes = {};                  // node → true, wenn der Sensor per Legenden-Klick ausgeblendet wurde.

	// ── Hilfsfunktionen ────────────────────────────────────────────────────────

	// Kurzbezeichnung des Sensors, z. B. Node 3 → "S03". padStart füllt mit führender Null.
	function nodeId(node)   { return 'S' + String(node).padStart(2, '0'); }
	// Längere Bezeichnung, z. B. Node 3 → "Sensor 03".
	function nodeName(node) { return 'Sensor ' + String(node).padStart(2, '0'); }

	// Anzeigename: der in der Sensorverwaltung vergebene Name (kommt als sensor.name
	// aus der API), sonst Fallback auf die Kurz-ID "S03" (für die kompakte Legende/Tooltip).
	function displayName(sensor) { return sensor.name || nodeId(sensor.node); }
	// Wie displayName, aber mit dem längeren Fallback "Sensor 03" für die Karten-Kopfzeile.
	function cardName(sensor)    { return sensor.name || nodeName(sensor.node); }

	// Liefert die feste Farbe eines Sensors. Beim ersten Aufruf für eine Node wird
	// die nächste freie Palettenfarbe vergeben und gemerkt, damit sie konstant bleibt.
	function colorForNode(nodeKey) {
		if (!(nodeKey in colorByNode)) {
			// "% SENSOR_COLORS.length" sorgt dafür, dass die Palette bei > 10 Sensoren von vorn beginnt.
			colorByNode[nodeKey] = SENSOR_COLORS[assignedColors % SENSOR_COLORS.length];
			assignedColors++;
		}
		return colorByNode[nodeKey];
	}

	// Wandelt die API-Daten eines Sensors in das von ECharts erwartete Format um:
	// ein Array aus [zeitstempel_in_ms, temperatur]-Paaren.
	function toSeriesData(sensor) {
		var dates = sensor.dates || [], temps = sensor.temperatures || [];
		// map() läuft über alle Datumswerte; "i" ist der Index, um die passende Temperatur zu greifen.
		return dates.map(function (d, i) { return [new Date(d).getTime(), temps[i]]; });
	}

	// Zeitstempel der letzten Messung eines Sensors in Millisekunden. NaN, falls keine Daten.
	function lastTimestampMs(sensor) {
		var dates = sensor.dates || [];
		return dates.length ? new Date(dates[dates.length - 1]).getTime() : NaN;
	}

	// true, wenn der Sensor als offline gilt: keine Daten ODER letzte Messung älter als der Schwellwert.
	function isOffline(sensor) {
		var t = lastTimestampMs(sensor);
		return isNaN(t) ? true : (Date.now() - t > OFFLINE_THRESHOLD);
	}

	// Letzter Messwert eines Sensors (Zahl) oder null, falls keine Daten.
	function lastTemp(sensor) {
		var temps = sensor.temperatures || [];
		return temps.length ? temps[temps.length - 1] : null;
	}

	// true, wenn der letzte Messwert über dem Grenzwert liegt. sensor.threshold kommt aus
	// der API; ist keiner gesetzt (null/undefined), gibt es nie Alarm.
	function isOverThreshold(sensor) {
		if (sensor.threshold == null) { return false; }
		var t = lastTemp(sensor);
		return t != null && t > sensor.threshold;
	}

	// Waagerechte gestrichelte Linie auf Schwellwerthöhe für ein Karten-Chart
	// (leere data-Liste, wenn kein Grenzwert gesetzt ist → keine Linie).
	function thresholdMarkLine(sensor) {
		if (sensor.threshold == null) { return { data: [] }; }
		return {
			symbol: 'none', silent: true,
			data: [{ yAxis: sensor.threshold }],
			lineStyle: { color: '#d12f2f', type: 'dashed' },   // Alarmrot (= --offline)
			label: { show: false }
		};
	}

	// Zentrale Regel für die Linienfarbe eines Sensors: grau wenn offline, sonst seine feste Farbe.
	// Steht nur hier, damit eine Farbänderung an einer einzigen Stelle wirkt.
	function lineColor(sensor) {
		return isOffline(sensor) ? OFFLINE_LINE : colorForNode(String(sensor.node));
	}

	// Baut das ECharts-Linienobjekt für einen Sensor. Wird von Übersichts-Chart und
	// Sensorkarten gemeinsam genutzt; "width" steuert die Linienstärke.
	function lineSeries(sensor, width) {
		var color = lineColor(sensor);
		return {
			// smooth:false – Bezier-Glättung würde zwischen weit auseinanderliegenden
			// Messpunkten künstlich über- und unterschwingen und die Linien unruhiger
			// wirken lassen, als die Messwerte es eigentlich sind.
			name: displayName(sensor), type: 'line', smooth: false, showSymbol: false,
			lineStyle: { width: width, color: color },
			itemStyle: { color: color },
			data: toSeriesData(sensor)
		};
	}

	// Formatiert einen Zeitstempel (ms) als deutsche Uhrzeit "HH:MM:SS".
	function formatClock(ms) {
		return new Date(ms).toLocaleTimeString('de-DE',
			{ hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	// Gemeinsame Definition der X-Achse (Zeitachse). showLabels steuert, ob Beschriftung
	// sichtbar ist: im Übersichts-Chart ja, in den kleinen Karten nein (Platzersparnis).
	function timeAxis(showLabels) {
		return {
			type: 'time',                     // ECharts behandelt die Werte als echte Zeit.
			axisLabel: showLabels
				? { color: AXIS_LABEL, fontSize: 10, fontFamily: 'JetBrains Mono', formatter: '{HH}:{mm}' }
				: { show: false },            // Keine Beschriftung in den Mini-Charts.
			axisLine: { show: showLabels, lineStyle: { color: '#d3dae0' } },
			axisTick: { show: false },        // Keine kleinen Teilstriche.
			splitLine: { show: false }        // Keine senkrechten Gitterlinien.
		};
	}

	// Gemeinsame Definition der Y-Achse (Temperaturachse). fontSize variiert nach Chartgröße.
	function valueAxis(fontSize) {
		return {
			type: 'value',
			axisLabel: { color: AXIS_LABEL, fontSize: fontSize, fontFamily: 'JetBrains Mono',
			             formatter: function (v) { return v + '°'; } },  // Zahl + Gradzeichen, z. B. "23°".
			axisLine: { show: false },
			axisTick: { show: false },
			splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } }  // Gestrichelte waagerechte Hilfslinien.
		};
	}

	// Gemeinsame Tooltip-Definition (erscheint beim Hovern über das Chart).
	// trigger:'axis' = es werden alle Linien an der Mauszeit-Position gezeigt.
	function chartTooltip() {
		return {
			trigger: 'axis',
			backgroundColor: TOOLTIP_BG,
			borderColor: '#d3dae0',
			textStyle: { color: '#1e2630', fontFamily: 'JetBrains Mono', fontSize: 11 }
		};
	}

	// Berechnet das aktuell anzuzeigende Zeitfenster, immer am "Jetzt" ausgerichtet:
	// Start = jetzt minus Fensterbreite, Ende = jetzt. Dadurch wandert die Ansicht mit
	// der Uhr nach rechts (Schreiber-/Strip-Chart-Effekt). 60000 = Millisekunden pro Minute.
	function windowBounds() {
		var now = Date.now();
		return { start: now - windowMin * 60000, end: now };
	}

	// ── Zeitfenster-Steuerung ────────────────────────────────────────────────

	// Baut für jedes Preset einen Button und hängt ihn in die Topbar ein.
	function buildRangeControls() {
		TIME_PRESETS.forEach(function (preset) {
			var btn = document.createElement('button');
			btn.className   = 'range-btn';
			btn.textContent = preset.label;
			btn.dataset.min = String(preset.min);   // Merkt sich die Minuten am Element (data-min-Attribut).
			btn.addEventListener('click', function () {
				windowMin = preset.min;              // Neues Fenster übernehmen ...
				markActiveRange();                   // ... aktiven Button hervorheben ...
				render(lastSensors);                 // ... sofort mit vorhandenen Daten neu zeichnen ...
				loadAndRender();                     // ... und die passende Datenmenge fürs neue Fenster nachladen.
			});
			rangeContainer.appendChild(btn);
		});
		markActiveRange();   // Beim Start den Default-Button markieren.
	}

	// Markiert den Button, dessen Minutenwert dem aktuellen Fenster entspricht (CSS-Klasse).
	function markActiveRange() {
		rangeContainer.querySelectorAll('.range-btn').forEach(function (b) {
			b.classList.toggle('range-btn--active', Number(b.dataset.min) === windowMin);
		});
	}

	// ── Übersichts-Chart ───────────────────────────────────────────────────────

	// Einmalige Grundkonfiguration des großen Charts (Layout, Achsen, leere Serien).
	function initOverviewChart() {
		overviewChart.setOption({
			animation: false,   // Keine Übergangsanimation → Updates erscheinen sofort, kein "Nachziehen".
			grid:    { left: 40, right: 16, top: 8, bottom: 24 },  // Innenabstände der Zeichenfläche.
			tooltip: chartTooltip(),
			xAxis:   timeAxis(true),   // Mit Achsenbeschriftung.
			yAxis:   valueAxis(10),
			series:  []                // Linien kommen erst beim ersten Update dazu.
		});
	}

	// Aktualisiert die Linien des Übersichts-Charts anhand der aktuellen Sensordaten.
	function updateOverviewChart(sensors, bounds) {
		var series = sensors
			// Per Legende ausgeblendete Sensoren werden hier herausgefiltert (nicht gezeichnet).
			.filter(function (s) { return !hiddenNodes[String(s.node)]; })
			// Jeder verbleibende Sensor wird in eine Linienserie übersetzt (offline dünner gezeichnet).
			// Im Übersichts-Chart etwas dickere Linien als in den Karten, damit sich
			// mehrere überlagernde Sensoren besser unterscheiden lassen.
			.map(function (s) { return lineSeries(s, isOffline(s) ? 1.2 : 2); });
		overviewChart.setOption({
			xAxis:  { min: bounds.start, max: bounds.end },  // Sichtbares Zeitfenster setzen.
			series: series
		}, {
			// replaceMerge sorgt dafür, dass weggefallene Serien (ausgeblendete Sensoren)
			// auch wirklich entfernt werden, statt als Rest stehenzubleiben.
			replaceMerge: ['series']
		});
	}

	// ── Legende ─────────────────────────────────────────────────────────────

	// Legt für einen Sensor genau einmal einen Legendeneintrag an (oder gibt den vorhandenen zurück).
	function ensureLegendItem(sensor) {
		var key = String(sensor.node);
		if (legendByNode[key]) { return legendByNode[key]; }  // Schon vorhanden → fertig.

		var item = document.createElement('div');
		item.className = 'legend-item';
		// Klick auf den Eintrag schaltet den Sensor im Übersichts-Chart ein/aus.
		item.addEventListener('click', function () {
			hiddenNodes[key] = !hiddenNodes[key];                       // Sichtbarkeit umschalten.
			item.classList.toggle('legend-item--hidden', hiddenNodes[key]); // Optische Markierung (durchgestrichen).
			updateOverviewChart(lastSensors, windowBounds());          // Chart sofort neu zeichnen.
		});

		// Kleiner Farbbalken vor dem Namen.
		var swatch = document.createElement('span');
		swatch.className = 'legend-swatch';
		item.appendChild(swatch);

		// Beschriftung, z. B. "S03".
		var label = document.createElement('span');
		label.className   = 'legend-label';
		label.textContent = displayName(sensor);
		item.appendChild(label);

		legendContainer.appendChild(item);
		legendByNode[key] = { item: item, swatch: swatch, label: label };  // Referenzen merken.
		return legendByNode[key];
	}

	// Aktualisiert Aussehen eines Legendeneintrags (Offline-Zustand + Farbe des Balkens).
	function updateLegendItem(sensor) {
		var ref = ensureLegendItem(sensor);
		var offline = isOffline(sensor);
		ref.item.classList.toggle('legend-item--offline', offline);
		ref.swatch.style.background = lineColor(sensor);
		ref.label.textContent = displayName(sensor);   // Name bei jedem Poll neu setzen (folgt Umbenennungen ohne Reload).
	}

	// ── Sensorkarten ─────────────────────────────────────────────────────────────

	// Legt für einen Sensor genau einmal eine Karte an (Infospalte + kleines Chart).
	function ensureCard(sensor) {
		var key = String(sensor.node);
		if (cardsByNode[key]) { return cardsByNode[key]; }  // Schon vorhanden → fertig.

		var color = colorForNode(key);

		// Äußere Karte.
		var card = document.createElement('div');
		card.className = 'sensor-card';

		// Linke Infospalte.
		var info = document.createElement('div');
		info.className = 'sensor-info';
		card.appendChild(info);

		// Kopf: ID + Name. Beide Werte per textContent setzen (NICHT via innerHTML), damit ein
		// frei vergebener Sensorname nie als HTML interpretiert/ausgeführt wird (Stored-XSS-Schutz).
		var head = document.createElement('div');
		var idEl = document.createElement('div');
		idEl.className   = 'sensor-id';
		idEl.textContent = nodeId(sensor.node);
		var nameEl = document.createElement('div');   // Namens-Zeile merken, wird bei jedem Poll aktualisiert.
		nameEl.className   = 'sensor-name';
		nameEl.textContent = cardName(sensor);
		head.appendChild(idEl);
		head.appendChild(nameEl);
		info.appendChild(head);

		// Großer aktueller Messwert + Einheit "°C".
		var valueWrap = document.createElement('div');
		var valueEl = document.createElement('div');
		valueEl.className   = 'sensor-value';
		valueEl.style.color = color;
		valueEl.textContent = '—';                 // Platzhalter, bis echte Daten da sind.
		valueWrap.appendChild(valueEl);
		valueWrap.insertAdjacentHTML('beforeend', '<div class="sensor-unit">°C</div>');
		info.appendChild(valueWrap);

		// Zeile für Uhrzeit der letzten Messung bzw. OFFLINE-Badge.
		var statusEl = document.createElement('div');
		statusEl.className = 'sensor-time';
		info.appendChild(statusEl);

		// Rechts das kleine Verlaufs-Chart.
		var chartEl = document.createElement('div');
		chartEl.className = 'sensor-chart';
		card.appendChild(chartEl);

		gridContainer.appendChild(card);   // Karte ins Gitter hängen.

		// Eigenes ECharts-Mini-Chart für diesen Sensor.
		var chart = echarts.init(chartEl);
		chart.setOption({
			animation: false,
			grid:    { left: 34, right: 8, top: 6, bottom: 4 },
			tooltip: chartTooltip(),
			xAxis:   timeAxis(false),   // Ohne Achsenbeschriftung (kleine Fläche).
			yAxis:   valueAxis(9),
			series:  [{ type: 'line', data: [] }]   // Platzhalter; updateCard() ersetzt ihn sofort via lineSeries().
		});

		// Alle Bestandteile der Karte merken, damit updateCard() sie schnell findet.
		cardsByNode[key] = { chart: chart, root: card, valueEl: valueEl, statusEl: statusEl, nameEl: nameEl, color: color };
		return cardsByNode[key];
	}

	// Aktualisiert eine Sensorkarte mit den neuesten Daten.
	function updateCard(sensor, bounds) {
		var ref = ensureCard(sensor);          // Karte holen (oder beim ersten Mal anlegen).
		var offline = isOffline(sensor);
		var alarm   = !offline && isOverThreshold(sensor);   // Offline hat Vorrang vor Alarm.

		// Name bei jedem Poll neu setzen, damit Umbenennungen ohne Reload erscheinen.
		ref.nameEl.textContent = cardName(sensor);

		// Letzten Messwert und dessen Zeitpunkt bestimmen.
		var last   = lastTemp(sensor);
		var lastMs = lastTimestampMs(sensor);

		// Zustand der Karte umschalten: offline > alarm > normal.
		ref.root.classList.toggle('sensor-card--offline', offline);
		ref.root.classList.toggle('sensor-card--alarm', alarm);
		ref.valueEl.style.color = offline ? '#3a4a58' : (alarm ? 'var(--offline)' : ref.color);
		ref.valueEl.textContent = (last == null) ? '—' : Number(last).toFixed(1);  // 1 Nachkommastelle.

		if (offline) {
			ref.statusEl.innerHTML = '<span class="sensor-badge">OFFLINE</span>';
		} else if (alarm) {
			ref.statusEl.innerHTML = '<span class="sensor-badge sensor-badge--alarm">ÜBER GRENZWERT</span>';
		} else {
			ref.statusEl.className   = 'sensor-time';
			ref.statusEl.textContent = isNaN(lastMs) ? '—' : formatClock(lastMs);  // Uhrzeit der letzten Messung.
		}

		// Linie + Zeitfenster des Mini-Charts; zusätzlich die Schwellwertlinie (falls gesetzt).
		var series = lineSeries(sensor, 1.5);
		series.markLine = thresholdMarkLine(sensor);
		ref.chart.setOption({
			xAxis:  { min: bounds.start, max: bounds.end },
			series: [ series ]
		});
	}

	// ── Kopfzeile: Online-/Offline-Zähler ──────────────────────────────────────

	// Aktualisiert die Anzeige "x ONLINE | y OFFLINE" in der Topbar.
	function updateCounts(sensors) {
		var online  = sensors.filter(function (s) { return !isOffline(s); }).length;
		var offline = sensors.length - online;
		var alarm   = sensors.filter(function (s) { return !isOffline(s) && isOverThreshold(s); }).length;

		document.getElementById('countOnline').textContent = online + ' ONLINE';

		// Trennzeichen und Offline-Anzeige nur einblenden, wenn es offline-Sensoren gibt.
		var sep = document.getElementById('countSep');
		var off = document.getElementById('countOffline');
		if (offline > 0) {
			off.textContent = offline + ' OFFLINE';
			off.hidden = false; sep.hidden = false;
		} else {
			off.hidden = true;  sep.hidden = true;
		}

		// Dasselbe für die Anzahl der Sensoren über Grenzwert.
		var sep2 = document.getElementById('countSep2');
		var al   = document.getElementById('countAlarm');
		if (alarm > 0) {
			al.textContent = alarm + ' ÜBER GRENZWERT';
			al.hidden = false; sep2.hidden = false;
		} else {
			al.hidden = true;  sep2.hidden = true;
		}
	}

	// ── Zeichnen + Datenabruf ─────────────────────────────────────────────────

	// Zeichnet die gesamte Oberfläche aus einem Satz Sensordaten neu.
	function render(sensors) {
		if (!sensors.length) { return; }   // Ohne Daten nichts tun.
		var bounds = windowBounds();       // Einmal das Zeitfenster berechnen und überall verwenden.
		updateCounts(sensors);
		updateOverviewChart(sensors, bounds);
		sensors.forEach(function (s) {
			updateCard(s, bounds);
			updateLegendItem(s);
		});
	}

	// Holt frische Daten von der API und zeichnet danach neu.
	function loadAndRender() {
		if (inFlight) { return; }          // Läuft schon ein Abruf? Dann diesen überspringen.
		inFlight = true;
		// Nur das aktuell gewählte Zeitfenster anfragen (Minuten), statt immer alles zu laden.
		fetch('/temperature-data/?minutes=' + windowMin)
			.then(function (r) { return r.json(); })          // Antwort als JSON parsen.
			.then(function (json) {
				lastSensors = json.sensors || [];             // Daten merken (für Toggle/Range ohne neuen Abruf).
				render(lastSensors);
			})
			.catch(function () { /* Bei Fehler letzte Ansicht stehen lassen, statt zu leeren. */ })
			.finally(function () { inFlight = false; });      // Egal ob Erfolg/Fehler: Sperre lösen.
	}

	// ── Initialisierung ────────────────────────────────────────────────────────
	// Wird einmal beim Laden ausgeführt und startet die laufenden Timer.

	initOverviewChart();                              // Übersichts-Chart aufsetzen.
	buildRangeControls();                             // Zeitfenster-Buttons erzeugen.
	loadAndRender();                                  // Sofort einmal Daten holen + zeichnen.
	setInterval(loadAndRender, POLL_INTERVAL_MS);     // Danach alle 10 s wiederholen.

	// Live-Uhr in der Statusleiste, die jede Sekunde tickt.
	var clockEl = document.getElementById('clock');
	function tick() { if (clockEl) { clockEl.textContent = formatClock(Date.now()); } }
	tick();
	setInterval(tick, 1000);

	// Bei Größenänderung des Fensters müssen alle Charts neu vermessen werden,
	// sonst behalten sie ihre alte Pixelgröße.
	window.addEventListener('resize', function () {
		overviewChart.resize();
		Object.keys(cardsByNode).forEach(function (k) { cardsByNode[k].chart.resize(); });
	});

});
