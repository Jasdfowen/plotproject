import csv
from datetime import datetime
from itertools import islice
import pathlib
from django.conf import settings
from django.utils import timezone
from django.core.management.base import BaseCommand
from plot.models import SensorTemperature   

class Command(BaseCommand):
    help = 'Load data from temperature file'

    def handle(self, *args, **kwargs):
        datafile = r"temperature_edited.csv"

        with open(datafile, newline='') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                dt = datetime(
                    year=int(row['year']),
                    month=int(row['month']),
                    day=int(row['day']),
                    hour=int(row['hour']),
                    minute=int(row['minute']),
                    second=0,
                )
                print((f"Loading data for {dt}..."))
                SensorTemperature.objects.get_or_create(date=timezone.make_aware(dt), temperature=row['temperature_c'], node=row['node_id'])