from django.db import models

# Create your models here.
class SensorTemperature(models.Model):
    date = models.DateTimeField()
    temperature = models.FloatField()
    node = models.IntegerField()

    class Meta:
        ordering = ['date',]

    def __str__(self):
        return f"{self.date}: {self.temperature}°C, in node {self.node}"