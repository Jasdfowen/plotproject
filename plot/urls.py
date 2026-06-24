from django.urls import path
from django.contrib.auth import views as auth_views

from . import views

urlpatterns = [
    path("", views.chart, name="chart"),
    path("login/", auth_views.LoginView.as_view(template_name="plot/login.html"), name="login"),
    path("temperature-data/", views.temperature_data, name="temperature_data"),
    path("export-csv/", views.export_csv, name="export_csv"),
    path("sensor-management/", views.sensor_management, name="sensor_management"),
    path("sensor-history", views.sensor_history, name="sensor_history"),
]