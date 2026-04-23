from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.http import JsonResponse

from plotly.subplots import make_subplots
import plotly.graph_objects as go
import plotly.express as px 

from .models import SensorTemperature
# Create your views here.
# API endpoint for ECharts data
@csrf_exempt
def temperature_data(request):
    # Get all data, grouped by node
    from collections import defaultdict
    data = defaultdict(lambda: {'dates': [], 'temperatures': []})
    for entry in SensorTemperature.objects.all().order_by('node', 'date'):
        data[entry.node]['dates'].append(entry.date.isoformat())
        data[entry.node]['temperatures'].append(entry.temperature)
    # Convert to list for easier JS handling
    sensors = []
    for node, values in data.items():
        sensors.append({'node': node, 'dates': values['dates'], 'temperatures': values['temperatures']})
    return JsonResponse({'sensors': sensors})

def chart(request):
    return render(request, "plot/chart.html")