from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.http import JsonResponse
from django.utils import timezone

from datetime import timedelta

from .models import SensorTemperature
# Create your views here.
# API endpoint for ECharts data
@csrf_exempt
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

def chart(request):
    return render(request, "plot/chart.html")