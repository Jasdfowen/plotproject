# plotproject

Django 6 web app that stores temperature measurements from multiple LoRa sensor nodes in SQLite and visualizes them in the browser with ECharts.

## What it does
- Receives temperature readings from remote sensor nodes over LoRa radio via `lora_receiver.py`.
- Stores readings in `db.sqlite3` as `plot.models.SensorTemperature` (`date`, `temperature`, `node`).
- Serves a JSON API at `/temperature-data/`.
- Renders one chart per sensor node on `/` and refreshes automatically every 10 seconds.

## How the two processes work together

```
[LoRa sensor nodes]  --radio-->  lora_receiver.py  --sqlite3 INSERT-->  db.sqlite3
                                                                              ^
                                                              Django ORM READ |
                                                                         manage.py runserver
                                                                              |
                                                                    browser polls /temperature-data/
```

`lora_receiver.py` and the Django server run independently and share the same `db.sqlite3` file. Neither process depends on the other being alive.

## Quick start

Run both processes in separate terminals:

```powershell
# Terminal 1 — Django web server
python manage.py runserver

# Terminal 2 — LoRa receiver (placeholder loop until real HAT is connected)
python lora_receiver.py
```

Open `http://127.0.0.1:8000/` — new readings appear within 10 seconds.

## LoRa receiver (`lora_receiver.py`)

- `save_reading(node, temperature)` writes one row directly to `db.sqlite3` via raw `sqlite3` (no Django dependency).
- `on_packet_received(raw_bytes)` parses an incoming packet and calls `save_reading()`. The current format assumes `b"node_id,temperature"` (e.g. `b"3,21.75"`) — adapt this to match your sensor firmware.
- `main()` contains a commented-out Waveshare SX1262 init skeleton. The placeholder loop at the bottom cycles fake readings every 10 seconds for testing without hardware.

## Data ingestion via CSV (alternative)

```powershell
python manage.py load_temperature
```

Reads from the hard-coded path `temperature_edited.csv` in the working directory. Example CSV files are in the repo root (`temperature.csv`, `temperature_edited.csv`).

## Other useful commands

```powershell
# Apply migrations
python manage.py migrate

# Clear all temperature rows
python manage.py shell -c "from plot.models import SensorTemperature; SensorTemperature.objects.all().delete()"

# Collect static files for production
python manage.py collectstatic
```
