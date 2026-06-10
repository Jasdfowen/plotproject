from django.urls import path

from . import views

urlpatterns = [
    path("", views.chart, name="chart"),
    path("temperature-data/", views.temperature_data, name="temperature_data"),
    path("export-csv/", views.export_csv, name="export_csv"),
]