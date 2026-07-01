from django.db import migrations


def normalize_dates(apps, schema_editor):
    # Alt-Daten des LoRa-Receivers wurden als ISO-Strings mit 'T'-Trenner und '+00:00'
    # gespeichert (datetime.isoformat()). Django/SQLite erwartet aber
    # "YYYY-MM-DD HH:MM:SS.ffffff" (UTC, ohne 'T'/Offset). Weil SQLite Datums-Strings
    # zeichenweise vergleicht, ließ 'T' (84) > ' ' (32) alle Werte fälschlich "größer"
    # wirken, wodurch date__lte-/Range-Filter (z. B. die Verlaufs-Ansicht) nichts fanden.
    # INSTR statt LIKE '%T%', um jegliche %-Formatierung in der Migration zu vermeiden.
    schema_editor.execute(
        "UPDATE plot_sensortemperature "
        "SET date = REPLACE(REPLACE(date, 'T', ' '), '+00:00', '') "
        "WHERE INSTR(date, 'T') > 0"
    )


class Migration(migrations.Migration):

    dependencies = [
        ('plot', '0007_alter_sensornodes_id_alter_sensortemperature_id'),
    ]

    operations = [
        # Reine Format-Normalisierung derselben Zeitpunkte → keine sinnvolle Umkehrung nötig.
        migrations.RunPython(normalize_dates, migrations.RunPython.noop),
    ]
