from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
import csv
from django.http import HttpResponse
from datetime import timedelta
from collections import Counter

from django.shortcuts import render, redirect
from .models import SensorTemperature, SensorNodes


# ── Gemeinsame Helfer für die JSON-Endpoints ────────────────────────────────
# temperature_data und history_data liefern dasselbe Sensor-Format; die
# Gruppierung/Serialisierung liegt daher nur hier, an einer Stelle.

def _group_by_node(readings):
    """Gruppiert ein nach (node, date) sortiertes Messwert-Queryset nach Node
    zu {node: {'dates': [...], 'temperatures': [...]}}."""
    data = {}
    for e in readings:
        r = data.setdefault(e.node, {'dates': [], 'temperatures': []})
        r['dates'].append(e.date.isoformat())
        r['temperatures'].append(round(e.temperature, 1))
    return data

def _node_meta():
    """Name + Schwellwert je Node in einem Query."""
    return {n: (name, threshold)
            for n, name, threshold in SensorNodes.objects.values_list('node', 'name', 'threshold')}

def _sensor_entry(node, readings, meta):
    """Baut das JSON-Objekt eines Sensors (Node + Meta + Messreihen)."""
    name, threshold = meta.get(node, ('', None))
    return {'node': node, 'name': name, 'threshold': threshold,
            'dates': readings['dates'], 'temperatures': readings['temperatures']}


def temperature_data(request):
    # Zeitfenster als Query-Parameter (?minutes=…): nur so viele Daten zurückgeben,
    # wie das aktuell gewählte Fenster im Frontend braucht. Default 15 min, begrenzt
    # auf 1 min … 30 Tage gegen fehlerhafte oder zu große Anfragen.
    try:
        minutes = int(request.GET.get('minutes', 15))
    except (TypeError, ValueError):
        minutes = 15
    minutes = max(1, min(minutes, 60 * 24 * 30))
    cutoff = timezone.now() - timedelta(minutes=minutes)

    # Messwerte im Fenster, nach Node gruppiert.
    data = _group_by_node(SensorTemperature.objects.filter(date__gte=cutoff).order_by('node', 'date'))
    meta = _node_meta()

    # Alle Nodes mit Verlauf durchgehen – auch die, die im Fenster nichts gesendet haben.
    sensors = []
    for node in SensorTemperature.objects.values_list('node', flat=True).distinct().order_by('node'):
        readings = data.get(node)
        if readings is None:
            # Kein Wert im Fenster → letzten bekannten Messwert mitgeben, damit die Karte
            # samt OFFLINE-Badge, letztem Wert und Uhrzeit sichtbar bleibt (sonst würde ein
            # länger als das Fenster stiller Sensor komplett aus dem Dashboard verschwinden).
            last = SensorTemperature.objects.filter(node=node).order_by('-date').first()
            readings = ({'dates': [last.date.isoformat()], 'temperatures': [round(last.temperature, 1)]}
                        if last else {'dates': [], 'temperatures': []})
        sensors.append(_sensor_entry(node, readings, meta))
    return JsonResponse({'sensors': sensors})

def export_csv(request):
    rows = SensorTemperature.objects.all().order_by('node', 'date')
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="temperature_readings.csv"'
    writer = csv.writer(response)
    writer.writerow(['Node', 'Date', 'Temperature'])  # Header
    for row in rows:
        writer.writerow([row.node, row.date.isoformat(), row.temperature])
    return response

def chart(request):
    return render(request, "plot/chart.html")

def history(request):
    return render(request, "plot/history.html")

def history_data(request):
    # Historische Messwerte für einen frei wählbaren Zeitraum (start/end als ISO-Strings,
    # z. B. "2026-07-01T10:00:00Z"). Anders als temperature_data gibt es hier keine Live-
    # oder Offline-Logik: es wird genau der angefragte Zeitraum geliefert. Fehlt ein
    # Parameter, gilt die letzte 24 h.
    def _aware(dt):
        # datetime-local liefert ggf. eine naive Zeit; bei USE_TZ=True müssen wir sie
        # in eine zeitzonenbewusste Zeit wandeln, sonst warnt/patzt der Filter.
        if dt and timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    end   = _aware(parse_datetime(request.GET.get('end', '')   or '')) or timezone.now()
    start = _aware(parse_datetime(request.GET.get('start', '') or '')) or (end - timedelta(hours=24))

    data = _group_by_node(SensorTemperature.objects
                          .filter(date__gte=start, date__lte=end)
                          .order_by('node', 'date'))
    meta = _node_meta()
    sensors = [_sensor_entry(node, data[node], meta) for node in sorted(data)]
    return JsonResponse({'start': start.isoformat(), 'end': end.isoformat(), 'sensors': sensors})

def sensor_management(request):
    if request.method == "POST":
        for key, value in request.POST.items():
            if key.startswith("name_"):
                sensor_id = key.removeprefix("name_")
                SensorNodes.objects.filter(id=sensor_id).update(name=value)
            elif key.startswith("threshold_"):
                sensor_id = key.removeprefix("threshold_")
                value = value.strip()
                threshold = float(value) if value else None
                SensorNodes.objects.filter(id=sensor_id).update(threshold=threshold)
        return redirect('sensor_management')
    nodes = SensorTemperature.objects.values_list('node', flat=True).distinct()
    for node in nodes:
        SensorNodes.objects.get_or_create(node=node)
    sensors = SensorNodes.objects.order_by('node')
    return render(request, "plot/sensor_management.html", {"sensors": sensors})

def sensor_history(request):
    sensors = []
    nodes = SensorTemperature.objects.values_list('node', flat=True).distinct().order_by('node')
    for node in nodes:
        temps  = list(SensorTemperature.objects.filter(node=node).values_list('temperature', flat=True))
        counts = Counter(round(t) for t in temps)
        # Lückenlose Klassen von min bis max: fehlende Grade (z. B. 29 zwischen 28 und 30)
        # erscheinen als leerer Balken (counts[b] == 0), statt dass die Nachbarn zusammenrücken.
        bins   = range(min(counts), max(counts) + 1) if counts else []
        sensors.append({
            'node':   node,
            'labels': [f"{b} °C" for b in bins],
            'values': [counts[b] for b in bins],
            'total':  len(temps),
        })
    return render(request, "plot/sensor_history.html", {"sensors": sensors})

