# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

A Django 6 web application that displays temperature measurements from multiple LoRa sensor nodes. It has four pages behind a login wall:

- **Live dashboard** (`/`) — polls the backend every 10 seconds, shows an overview chart plus one card per sensor, with online/offline/alarm status.
- **History explorer** (`/history/`) — a free-range, zoomable chart (no polling) for inspecting an arbitrary past time window.
- **Sensor management** (`/sensor-management/`) — rename nodes and set per-node alarm thresholds.
- **Distribution view** (`/sensor-history`) — per-sensor temperature histogram.

A separate LoRa receiver script writes incoming radio packets directly into the same SQLite database, independent of Django.

## Commands

```bash
# Start development server (loads DEBUG=True, hardcoded dev SECRET_KEY, no env needed)
python manage.py runserver --settings=mysite.settings_dev

# Start with production settings (requires SECRET_KEY env var; see Notes)
python manage.py runserver

# Create a login (required — every page except /login/ is behind RequireLoginMiddleware)
python manage.py createsuperuser

# Run LoRa receiver alongside Django (separate terminal)
python lora_receiver.py

# Apply database migrations
python manage.py migrate

# Load CSV data into the database
python manage.py load_temperature

# Create a new migration after model changes
python manage.py makemigrations

# Docker deployment (web + lora-rx + nginx reverse proxy)
docker compose up -d --build
```

## Architecture

**Two independent processes share one SQLite file:**

```
[lora_receiver.py]  --sqlite3 INSERT-->  db.sqlite3  <--Django ORM READ--  [Django / manage.py]
```

### Auth

`plot/middleware.py:RequireLoginMiddleware` forces login on every path except `/login/` and `/static/`. There is no signup view — create accounts with `createsuperuser` or the Django admin (`/admin/`). Sessions last 1 year (`SESSION_COOKIE_AGE` in settings) and don't expire on browser close.

### Live dashboard data flow

1. `GET /` → `plot/views.py:chart()` renders [plot/templates/plot/chart.html](plot/templates/plot/chart.html)
2. The template loads [plot/static/plot/js/echarts_plot.js](plot/static/plot/js/echarts_plot.js), which polls `GET /temperature-data/?minutes=<n>` every 10 seconds, where `<n>` is the currently selected time-window preset (5 min … 24 h; default 15 min)
3. `temperature_data()` in [plot/views.py](plot/views.py) only queries `SensorTemperature` rows within the requested window (not the full history) — this keeps payloads small. For a node with **no** reading in the window, it falls back to that node's single most recent reading, so an offline sensor's card/badge/last-value stay visible instead of disappearing.
4. JavaScript creates or updates one ECharts instance per sensor node, plus an overview chart combining all nodes. A sensor is flagged **offline** if its last reading is older than `OFFLINE_THRESHOLD` (60 s) compared to the browser's clock — see "Known gotchas" below. Each node also gets a threshold mark-line and an "ÜBER GRENZWERT" (over-threshold) badge if `sensor.threshold` is set and exceeded.

### History explorer data flow

1. `GET /history/` → `history()` renders [plot/templates/plot/history.html](plot/templates/plot/history.html)
2. [plot/static/plot/js/history_plot.js](plot/static/plot/js/history_plot.js) fetches **once** (no polling) from `GET /history-data/?start=<iso>&end=<iso>` for the user-chosen date/time range (defaults to the last 24 h if omitted)
3. `history_data()` in [plot/views.py](plot/views.py) returns the same per-sensor JSON shape as `temperature_data`, but with no offline fallback — it's a plain range query.
4. The chart uses ECharts `dataZoom` (slider + mouse wheel) to let the user zoom/pan freely within the loaded range.

Both endpoints share their grouping/serialization logic via `_group_by_node()`, `_node_meta()`, and `_sensor_entry()` in [plot/views.py](plot/views.py) — the JSON shape (`{node, name, threshold, dates, temperatures}`) lives in one place.

### LoRa receiver ([lora_receiver.py](lora_receiver.py))

Standalone script (no Django dependency). Key functions:
- `save_reading(node, temperature)` — opens `db.sqlite3` via raw `sqlite3`, inserts one row into `plot_sensortemperature`, closes. Writes the timestamp as `strftime('%Y-%m-%d %H:%M:%S.%f')` (UTC) — **do not** switch this back to `datetime.isoformat()`; see "Known gotchas".
- `on_packet_received(raw_bytes)` — parses `b"node_id,temperature"` and calls `save_reading()`; adapt to match actual sensor firmware
- `read_serial_port()` — reads from `/dev/ttyACM0` at 115200 baud, parses lines matching `Start Receive: <node>,<t1>,<t2>,<t3> :End Receive`, uses first temperature value
- `dummy_receive_loop()` — generates fake readings every 5 seconds for testing without hardware
- `main(dummy=True)` — defaults to dummy mode; pass `dummy=False` to use the serial port

**Actual serial packet format:** `Start Receive: 1,23.9,24.6,-0.6 :End Receive` (node_id, then three temperature values; only the first is saved)

**Why raw sqlite3 instead of Django ORM:** keeps the receiver independent of the Django project structure; no framework bootstrap needed.

## Key Files

- [plot/models.py](plot/models.py):
  - `SensorTemperature(date: DateTimeField, temperature: FloatField, node: IntegerField)` — raw readings.
  - `SensorNodes(node: IntegerField unique, name: CharField, threshold: FloatField)` — per-node display name and alarm threshold, edited via `sensor_management`.
- [plot/views.py](plot/views.py) — `chart`, `history` (pages); `temperature_data`, `history_data` (JSON APIs); `sensor_management` (name/threshold edit form, auto-creates a `SensorNodes` row per distinct node seen in `SensorTemperature`); `sensor_history` (histogram); `export_csv`.
- [plot/urls.py](plot/urls.py) — routes: `/` → `chart`, `/login/` → Django's `LoginView`, `/temperature-data/`, `/history/`, `/history-data/`, `/export-csv/`, `/sensor-management/`, `/sensor-history`.
- [plot/middleware.py](plot/middleware.py) — `RequireLoginMiddleware`, registered in both settings files.
- [plot/management/commands/load_temperature.py](plot/management/commands/load_temperature.py) — reads `temperature_edited.csv` (relative to cwd) using `get_or_create` to avoid duplicates.
- [lora_receiver.py](lora_receiver.py) — standalone receiver; replace the placeholder loop with real HAT code.
- [mysite/settings.py](mysite/settings.py) / [mysite/settings_dev.py](mysite/settings_dev.py) — production vs. local settings; see Notes.
- [Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml), [nginx.conf](nginx.conf) — deployment: `web` (gunicorn) + `lora-rx` (receiver) + `nginx` (reverse proxy + static files), sharing `db.sqlite3` and `staticfiles/` via bind mounts.

## Notes

- `requirements.txt` exists: Django 6.0.3, asgiref, sqlparse, pyserial, gunicorn. Plotly is **no longer** a dependency (removed from views).
- `mysite/settings.py` (production): `DEBUG=False`, `SECRET_KEY` from the `SECRET_KEY` env var (required — the app won't start without it). `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` are **currently hardcoded to `["*"]` for testing** (accept any host, trust any origin) — the env-driven version (`ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS` as comma-separated env vars, with sane defaults) is commented out directly above each line in the file. Restore the commented-out version before any real deployment; `"*"` is only meant to unblock testing across networks/IPs.
- `mysite/settings_dev.py` (local dev): `DEBUG=True`, hardcoded insecure `SECRET_KEY`, `ALLOWED_HOSTS=['localhost', '127.0.0.1']`. Use `--settings=mysite.settings_dev` locally so you don't need a `SECRET_KEY` env var.
- No `.env` file exists yet in the repo (it's gitignored). `docker-compose.yml` reads one via `env_file: .env` for the `web` service — create it before `docker compose up` in production.
- No tests are implemented (`plot/tests.py` exists but is empty).
- The `load_temperature` command reads `temperature_edited.csv` from the current working directory (hardcoded relative path).
- All four page templates are full standalone HTML documents (no shared base template) that load ECharts from CDN and `plot/static/plot/css/chart.css` plus their own page-specific CSS.
- `staticfiles/` is the `collectstatic` output directory; edit CSS/JS only in `plot/static/plot/`, not in `staticfiles/`. In Docker, nginx serves `/static/` from `staticfiles/` directly — run `collectstatic` after any static file change before deploying.

### Known gotchas

- **Offline detection uses the browser's clock, not the server's.** `echarts_plot.js` marks a sensor offline when `Date.now() - lastReadingMs > 60000`, comparing the *viewer's* clock against the *Raspberry Pi's* clock at the time it wrote the reading. If the Pi's system clock is wrong (common on a Pi without RTC/NTP, e.g. on a restrictive network), every sensor can appear permanently offline even though data is still arriving. Check `timedatectl` on the Pi first when sensors look stuck offline; a more robust fix would compare against a server-supplied timestamp instead of the client clock.
- **SQLite datetime format matters.** `SensorTemperature.date` is compared as a string by SQLite. Django expects `"YYYY-MM-DD HH:MM:SS.ffffff"` (space separator, no UTC offset). `lora_receiver.py` used to write `datetime.isoformat()` (`"...T...+00:00"`), which sorts *after* Django's format character-by-character and silently broke every upper-bound filter (`date__lte`, i.e. any range/history query) while leaving open-ended queries (`date__gte` only, like the old 30-day live view) unaffected. Fixed in the receiver (writes `strftime('%Y-%m-%d %H:%M:%S.%f')` now) and for existing rows via migration `0008_normalize_sensortemperature_dates`. If historical range queries ever silently return nothing again, check the raw string format in the `date` column first.
- **Stale `SensorNodes` entries aren't cleaned up automatically.** `sensor_management()` only ever creates rows (`get_or_create` per node with data) — it never deletes any, even after a node's `SensorTemperature` rows are gone (e.g. after a manual DB wipe). Old node names/thresholds linger in the management UI until removed manually via the Django shell/admin. An archive-instead-of-delete feature is planned but not yet implemented (see project memory).
- Recurring `alter field id` migrations (e.g. `0007_alter_sensornodes_id_alter_sensortemperature_id`) show up because `default_auto_field` isn't pinned in `PlotConfig`; harmless but will keep reappearing under `makemigrations --check` until pinned.
