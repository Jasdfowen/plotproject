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
    
class SensorNodes(models.Model):
    node = models.IntegerField(unique=True)
    name = models.CharField(max_length=100, blank=True)
    threshold = models.FloatField(null=True, blank=True)

    def __str__(self):
        return f"Node {self.node}: {self.name}, threshold={self.threshold}"