# Plotproject – Project Understanding

## 1) What this project is
`plotproject` is a Django 6 web application that stores temperature measurements from multiple sensor nodes in SQLite and visualizes them in the browser with ECharts.

At a high level:
- Backend: Django project `mysite` + app `plot`
- Database: `db.sqlite3`
- Frontend charting: ECharts loaded from CDN
- Data ingestion: custom Django management command

---

## 2) Top-level structure
- `manage.py`: standard Django entry point for commands (`runserver`, `migrate`, custom commands, etc.).
- `mysite/`: project configuration (settings, root URL routing, WSGI/ASGI).
- `plot/`: main app containing model, views, app URLs, templates, static JS, and ingestion command.
- `db.sqlite3`: local development database.
- `staticfiles/`: collected static output (`STATIC_ROOT`) including Django admin assets (and copied app static files).

---

## 3) Django configuration (`mysite`)
### `mysite/settings.py`
- Registers `plot` in `INSTALLED_APPS` via `plot.apps.PlotConfig`.
- Uses SQLite database at `BASE_DIR / 'db.sqlite3'`.
- Uses app templates (`APP_DIRS = True`), no extra global template dirs.
- Static settings:
  - `STATIC_URL = 'static/'`
  - `STATIC_ROOT = BASE_DIR / 'staticfiles'`

### `mysite/urls.py`
- `/admin/` -> Django admin.
- `/` -> includes `plot.urls` (so the app provides the default site pages/API routes).

---

## 4) App design (`plot`)
### Data model (`plot/models.py`)
`SensorTemperature`:
- `date` (`DateTimeField`)
- `temperature` (`FloatField`)
- `node` (`IntegerField`)
- Ordered by date (`Meta.ordering = ['date']`)

This represents timestamped temperature readings for each sensor node.

### URL routes (`plot/urls.py`)
- `""` -> `views.chart` (main chart page)
- `"temperature-data/"` -> `views.temperature_data` (JSON API for chart data)

### Views (`plot/views.py`)
- `chart(request)`: renders `plot/chart.html`.
- `temperature_data(request)`: loads all `SensorTemperature` records, groups by `node`, and returns JSON:
  - per sensor: `node`, `dates[]`, `temperatures[]`

The API shape is:
```json
{
  "sensors": [
    {"node": 1, "dates": ["..."], "temperatures": [21.4, 21.8]}
  ]
}
```

---

## 5) Frontend rendering flow
### Template (`plot/templates/plot/chart.html`)
- Loads ECharts from CDN.
- Provides root container `<div id="main">`.
- Loads app JS: `plot/js/echarts_plot.js` via Django static tag.

### Client script (`plot/static/plot/js/echarts_plot.js`)
On `DOMContentLoaded`:
1. Fetches `/temperature-data/`.
2. Clears `#main` container.
3. For each sensor in response:
   - Creates a titled section (`Sensor N`).
   - Creates one ECharts line chart.
   - X-axis: timestamps (`dates`)
   - Y-axis: temperature in °C (`temperatures`)
4. Shows fallback text for empty/error cases.

Result: one line chart per sensor node on a single page.

---

## 6) Data ingestion command
### `plot/management/commands/load_temperature.py`
Custom management command that:
- Reads CSV rows from hardcoded file path:
  `C:\Users\Lukas\Desktop\Projektoberflaeche\temperature.csv`
- Builds datetime from CSV fields (`year`, `month`, `day`, `hour`, `minute`).
- Converts to timezone-aware datetime.
- Inserts rows with `get_or_create` into `SensorTemperature`.

So this command is the bridge from raw CSV to database records used by the chart API.

---

## 7) Migration history insight
- `0001_initial.py`: originally created a `CO2` model.
- `0002_...`: introduced `SensorTemperature` and removed `CO2`.
- `0003_...`: changed `SensorTemperature.date` from `DateField` to `DateTimeField`.

This shows the app evolved from a CO2 concept to node-based temperature time series.

---

## 8) Current state and observations
- Admin and tests exist but are mostly scaffold placeholders (`plot/admin.py`, `plot/tests.py`).
- `views.py` imports Plotly modules, but chart rendering currently uses ECharts on the frontend (Plotly imports appear unused).
- `staticfiles/` contains collected static assets (including Django admin files), typical after `collectstatic`.

---

## 9) End-to-end runtime flow
1. Run server -> root URL (`/`) maps to `plot.chart`.
2. Browser loads `chart.html` and `echarts_plot.js`.
3. JS requests `/temperature-data/`.
4. Django view queries `SensorTemperature` and returns grouped JSON.
5. ECharts renders one line plot per sensor node.

Data availability depends on running the custom `load_temperature` command to populate the database.
