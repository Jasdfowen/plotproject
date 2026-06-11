from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.http import JsonResponse
from django.utils import timezone
import csv
from django.http import HttpResponse
from datetime import timedelta

from .models import SensorTemperature

def temperature_data(request):
    # Only return the last 30 days of readings, grouped by node.
    cutoff = timezone.now() - timedelta(days=30)
    data = {}
    for entry in SensorTemperature.objects.filter(date__gte=cutoff).order_by('node', 'date'):
        if entry.node not in data:
            data[entry.node] = {'dates': [], 'temperatures': []}
        data[entry.node]['dates'].append(entry.date.isoformat())
        data[entry.node]['temperatures'].append(entry.temperature)
    # Convert to list for easier JS handling
    sensors = []
    for node, values in data.items():
        sensors.append({'node': node, 'dates': values['dates'], 'temperatures': values['temperatures']})
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