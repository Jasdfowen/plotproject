# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

A Django 6 web application that displays real-time temperature measurements from multiple sensor nodes. The frontend polls the backend every 10 seconds and renders per-node charts using ECharts. A separate LoRa receiver script writes incoming radio packets directly into the same SQLite database.

## Commands

```bash
# Start development server
python manage.py runserver

# Run LoRa receiver alongside Django (separate terminal)
python lora_receiver.py

# Apply database migrations
python manage.py migrate

# Load CSV data into the database
python manage.py load_temperature

# Create a new migration after model changes
python manage.py makemigrations
```

## Architecture

**Two independent processes share one SQLite file:**

```
[lora_receiver.py]  --sqlite3 INSERT-->  db.sqlite3  <--Django ORM READ--  [Django / manage.py]
```

### Django data flow

1. `GET /` → `plot/views.py:chart()` renders [plot/templates/plot/chart.html](plot/templates/plot/chart.html)
2. The template loads [plot/static/plot/js/echarts_plot.js](plot/static/plot/js/echarts_plot.js), which polls `GET /temperature-data/` every 10 seconds
3. `temperature_data()` in [plot/views.py](plot/views.py) queries all `SensorTemperature` rows, groups by `node`, returns JSON: `{ sensors: [{ node, dates, temperatures }] }`
4. JavaScript creates or updates one ECharts instance per sensor node, showing the last 8 hours of data

### LoRa receiver ([lora_receiver.py](lora_receiver.py))

Standalone script (no Django dependency). Key functions:
- `save_reading(node, temperature)` — opens `db.sqlite3` via raw `sqlite3`, inserts one row into `plot_sensortemperature`, closes
- `on_packet_received(raw_bytes)` — parses a packet and calls `save_reading()`; adapt the parsing to match your sensor's transmit format
- `main()` — contains commented-out Waveshare SX1262 init skeleton and a placeholder loop (cycles fake readings every 10s) for testing without hardware

**Packet format assumed:** `b"node_id,temperature"` (e.g. `b"3,21.75"`) — change `on_packet_received` to match actual sensor firmware.

**Why raw sqlite3 instead of Django ORM:** keeps the receiver independent of the Django project structure; no framework bootstrap needed.

## Key Files

- [plot/models.py](plot/models.py) — `SensorTemperature(date: DateTimeField, temperature: FloatField, node: IntegerField)`
- [plot/views.py](plot/views.py) — two views: `chart` (page) and `temperature_data` (JSON API, `@csrf_exempt`)
- [plot/urls.py](plot/urls.py) — routes `/` → `chart`, `/temperature-data/` → `temperature_data`
- [plot/management/commands/load_temperature.py](plot/management/commands/load_temperature.py) — reads `temperature_edited.csv` (relative to cwd) using `get_or_create` to avoid duplicates
- [lora_receiver.py](lora_receiver.py) — standalone receiver; replace the placeholder loop with real HAT code

## Notes

- `plot/views.py` imports Plotly but it is unused — ECharts (CDN) is the active charting library.
- `DEBUG = True` and `SECRET_KEY` is hardcoded in [mysite/settings.py](mysite/settings.py) — development only.
- No tests are implemented (`plot/tests.py` exists but is empty).
- The `load_temperature` command reads `temperature_edited.csv` from the current working directory (hardcoded relative path).
