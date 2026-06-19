from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.http import JsonResponse
from django.utils import timezone
import csv
from django.http import HttpResponse
from datetime import timedelta

from django.shortcuts import render, redirect
from .models import SensorTemperature, SensorNodes

def temperature_data(request):
    # Only return the last 30 days of readings, grouped by node.
    cutoff = timezone.now() - timedelta(days=30)
    data = {}
    for entry in SensorTemperature.objects.filter(date__gte=cutoff).order_by('node', 'date'):
        if entry.node not in data:
            data[entry.node] = {'dates': [], 'temperatures': []}
        data[entry.node]['dates'].append(entry.date.isoformat())
        data[entry.node]['temperatures'].append(round(entry.temperature, 1))

    #Add alias to nodes
    names = dict(SensorNodes.objects.values_list('node', 'name'))

    # Convert to list for easier JS handling
    sensors = []
    for node, readings in data.items():
        sensors.append({
            'node': node,
            'name': names.get(node, ''),
            'dates': readings['dates'],
            'temperatures': readings['temperatures']
        })
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