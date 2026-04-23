# plotproject

Django 6 web app that stores temperature measurements (multiple sensor nodes) in SQLite and visualizes them in the browser with ECharts.

## What it does
- Stores readings in `db.sqlite3` as `plot.models.SensorTemperature` (`date`, `temperature`, `node`).
- Serves a small JSON API at `/temperature-data/`.
- Renders one chart per sensor node on `/` and refreshes automatically.

## Project structure
- `manage.py`: Django entry point.
- `mysite/`: project config (`settings.py`, `urls.py`, `wsgi.py`, `asgi.py`).
- `plot/`: main app (model, views, urls, template, static JS, management command).
- `plot/templates/plot/chart.html`: loads ECharts + `plot/static/plot/js/echarts_plot.js`.
- `plot/static/plot/js/echarts_plot.js`: frontend rendering logic.

## Runtime flow
1. `/` renders `plot/templates/plot/chart.html`.
2. Browser loads `echarts_plot.js`.
3. JS polls `/temperature-data/` every few seconds.
4. Response is grouped by node; JS renders/updates one chart per node.
5. Each chart has a small info panel showing the sensor number and the latest value.

## Data ingestion
There is a custom command at `plot/management/commands/load_temperature.py`.

Notes:
- It currently reads from a hard-coded CSV path (update that path if you want to load from a different file).
- Example CSV files in this repo root:
  - `temperature.csv`
  - `temperature_edited.csv` (extended dataset)

## Quick commands (PowerShell)

Run the dev server:
```powershell
python manage.py runserver
```

Load CSV data (uses the path inside `load_temperature.py`):
```powershell
python manage.py load_temperature
```

Clear all temperature rows:
```powershell
python manage.py shell -c "from plot.models import SensorTemperature; SensorTemperature.objects.all().delete()"
```

Insert one hardcoded datapoint:
```powershell
python manage.py shell -c "from datetime import datetime; from django.utils import timezone; from plot.models import SensorTemperature; SensorTemperature.objects.create(date=timezone.make_aware(datetime(2026,3,30,11,0,0)), temperature=21.9, node=2)"
```

## Static files
- `STATIC_ROOT` is `staticfiles/`.
- In production (or if you rely on collected static), run:
```powershell
python manage.py collectstatic
```
