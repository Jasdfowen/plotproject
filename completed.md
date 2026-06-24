# Completed Extensions

Punkte aus [extensions.md](extensions.md), die inzwischen umgesetzt sind. Verschoben,
damit `extensions.md` nur noch offene Vorhaben enthält.

## Frontend / UI

**Human-readable node names**
- Neues Model `SensorNodes(node, name, threshold)` + Seite `/sensor-management/` zum Vergeben von Namen.
- Dashboard zeigt den vergebenen Namen **live** (ohne Reload) in Legende, Kartenkopf und Tooltip; Fallback auf "S03"/"Sensor 03".
- Dateien: `plot/models.py`, `plot/views.py` (`sensor_management`, `temperature_data`), `plot/templates/plot/sensor_management.html`, `plot/static/plot/js/echarts_plot.js`.

**Admin kann Sensor-/Empfängernamen ändern**
- Dieselbe `/sensor-management/`-Seite — Namen sind editierbar und werden per POST gespeichert (Redirect-after-POST).
- (durch das Namens-Feature oben abgedeckt)

**Dashboard status summary**
- "x ONLINE | y OFFLINE"-Zähler in der Topbar, blendet die Offline-Anzeige nur ein, wenn nötig.
- Dateien: `plot/templates/plot/chart.html`, `plot/static/plot/js/echarts_plot.js` (`updateCounts`).

**CSV export**
- Endpoint `/export-csv/` streamt alle Messwerte als CSV; "CSV"-Button in der Topbar.
- Dateien: `plot/views.py` (`export_csv`), `plot/urls.py`.

## Receiver

**WAL-Modus**
- `PRAGMA journal_mode=WAL` bei jeder Verbindung in `save_reading()` — verhindert Schreib-/Lesekollisionen zwischen Receiver und Django.
- Datei: `lora_receiver.py`.

**Auto-Reconnect bei USB-Drop**
- `read_serial_port()` schließt den Port und öffnet ihn neu, wenn während des Betriebs eine Exception auftritt. (Beim Start bewusst fail-fast — kein Retry, wenn der Port von Anfang an fehlt.)
- Datei: `lora_receiver.py`.

**try/except um DB-Writes**
- `save_reading()` kapselt den Insert in try/except/finally; ein fehlgeschlagener Write beendet den Prozess nicht.
- Datei: `lora_receiver.py`.

## Über die ursprüngliche Liste hinaus

**Geteiltes Login-System**
- Django-Auth `LoginView` + eigene `RequireLoginMiddleware` schützt die ganze Seite; `/login/` und `/static/` sind ausgenommen.
- Dateien: `plot/middleware.py`, `plot/urls.py`, `mysite/settings.py`, `plot/templates/plot/login.html`, `plot/static/plot/css/login.css`.
