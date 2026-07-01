# Extensions & Planned Improvements

> Bereits umgesetzte Punkte stehen in [completed.md](completed.md).

## High Priority

**Receiver hardening (Rest)**
- Harden packet parsing: wrap the `split(',')` / `int()` / `float()` in `on_packet_received()` in try/except so a malformed packet is logged and skipped instead of raising
- (try/except around DB writes, USB auto-reconnect and WAL mode are already done — see completed.md)

**Receiver as a system service**
- Run `lora_receiver.py` as a systemd unit with `Restart=always`
- Auto-starts on boot, auto-recovers from crashes — a monitoring system that silently stops monitoring after a power cycle is the classic industrial failure mode

**Receiver heartbeat**
- Receiver writes a timestamp (small DB table or file) every loop
- API exposes it; if stale, the UI shows one banner "Receiver offline" instead of N red sensor panels
- Distinguishes "one sensor down" from "receiver crashed"

**Save all three temperatures per packet**
- Serial packets carry three values (`1,23.9,24.6,-0.6`) but only the first is saved
- Data that is never stored can never be recovered

**Data gap rendering**
- ECharts draws a line across outages, making missing data look valid
- Insert `null` points when consecutive readings are further apart than ~3× the expected interval so the line visibly breaks

**Plausibility filter in receiver**
- Reject readings outside a sane range (e.g. -40 °C to 100 °C) at insert time
- Prevents glitched packets from wrecking the y-axis scale

---

## Medium Priority

**Threshold-Visualisierung & Alarme** *(das `threshold`-Feld liegt bereits in der DB — siehe `SensorNodes` —, wird aber noch nirgends gelesen)*
- Threshold ins JSON aufnehmen (wie `name`), dann im Chart eine waagerechte `markLine` / `markArea` auf Schwellwerthöhe zeichnen
- Wert/Karte rot färben, sobald die letzte Messung über dem Schwellwert liegt (analog zur bestehenden `--offline`-Optik)
- **Alarm mit Quittierung (ACK):** Alarm bleibt "latched" (rot/blinkend) bis er per Klick quittiert wird — auch wenn der Wert schon wieder normal ist; so wird eine kurze nächtliche Spitze nicht verpasst
- Benachrichtigung bei Überschreitung: Browser-`Notification` + kurzer Ton und/oder E-Mail (Djangos SMTP) bzw. Eintrag in eine Event-Tabelle

**Incremental data fetching**
- `temperature_data()` lädt aktuell bei jedem Poll alle Zeilen; die DB wächst unbegrenzt
- `?since=<timestamp>`-Query-Param akzeptieren und nur neuere Zeilen zurückgeben
- Client hält die Serie im Speicher und hängt nur neue Punkte an

**Alarm / event history**
- Kleines `Event`-Model: `(node, type, timestamp)` — offline gegangen, zurück, Schwellwert über-/unterschritten
- Der Chart kann "wann genau ist es ausgefallen?" nach Daten-Retention nicht mehr beantworten

**RSSI / SNR logging**
- Wenn das LoRa-HAT die Signalqualität liefert, zusammen mit der Temperatur loggen
- Ein schwächer werdender Funklink kündigt Knotenausfälle an, bevor sie passieren

**Battery voltage**
- Wenn die Sensor-Firmware sie senden kann, das nützlichste Zusatzfeld für Funkknoten
- Batterien nach Plan tauschen statt nach Ausfall

---

## Low Priority / Quick Wins

**DB index on `(node, date)`**
- Die API sortiert bei jedem Poll genau danach
- Ein `Meta.indexes`-Eintrag in `models.py` + Migration

**Register `SensorTemperature` in `admin.py`**
- Eine Zeile; liefert eine kostenlose UI zum Inspizieren, Filtern und Löschen schlechter Messwerte
- Die Admin-App ist bereits installiert und ungenutzt

**Dark/Bright-Mode-Umschalter (oben rechts)**
- Toggle in der Topbar, das zwischen dem hellen SCADA-Theme und einer dunklen Variante wechselt
- Die Farben liegen schon zentral als `:root`-Variablen in `chart.css` — ein zweites Variablenset + Body-Klasse genügt; Auswahl in `localStorage` merken

**Browser tab alert**
- `document.title = "⚠ 1 offline — LoRa Monitor"`, wenn ein Knoten stale ist
- Drei Zeilen JS; signalisiert Probleme im Hintergrund-Tab

**Stale fetch notice**
- Nach dem ersten Laden sind Fetch-Fehler aktuell stumm (`catch` lässt die alte Ansicht stehen)
- Kleinen Hinweis "letzte Aktualisierung fehlgeschlagen, Daten von HH:MM" zeigen, damit niemand einer eingefrorenen Seite vertraut

**Data retention / downsampling**
- Die DB wächst unbegrenzt ohne Aufräumen
- Alte hochauflösende Punkte nach einer konfigurierbaren Aufbewahrungszeit ausdünnen

**Production hardening**
- `DEBUG = True`, hartkodierter `SECRET_KEY`, leeres `ALLOWED_HOSTS` in `settings.py`
- Wird relevant, sobald der Server in einem echten Netzwerk steht

---

## New Ideas (kreativ)

**Lageplan-Ansicht** 🌟
- Operator lädt einen Grundriss (z.B. Kühlhaus-Plan/Foto) hoch und platziert jeden Sensor als farbigen Punkt darauf (grün/gelb/rot nach Temperatur/Status)
- Statt abstrakter "S03"-Karten sieht man auf einen Blick *wo im Gebäude* es zu warm wird — sehr industrietauglich und visuell stark

**Chart-Annotationen**
- Operator klickt auf einen Zeitpunkt im Verlauf und hinterlegt eine Notiz ("Tür offen gelassen", "Abtauzyklus")
- Als kleines Event-Model gespeichert und als Marker eingeblendet — erklärt Anomalien Wochen später noch, was reine Messdaten nie können

**Trend-Pfeil / Änderungsrate**
- Neben dem aktuellen Wert ein ↑/↓ mit °C/min aus den letzten Messpunkten
- Ein Sensor, der *schnell* wärmer wird, ist dringender als einer, der langsam driftet — wenig Code, großer Aussagewert

**Kalender-Heatmap**
- GitHub-Style-Jahresansicht pro Sensor: jeder Tag ein Kästchen, eingefärbt nach Tagesdurchschnitt/-maximum
- Macht saisonale Muster und einzelne Ausreißertage sofort sichtbar (ECharts hat einen Calendar-Coordinate-Typ)

**Wartungsmodus pro Sensor**
- Sensor in der Verwaltung als "in Wartung" markieren (Boolean-Feld an `SensorNodes`) → löst keinen Offline-/Threshold-Alarm aus und wird neutral dargestellt
- Verhindert Fehlalarm-Flut beim Batteriewechsel

**Pause-/Inspektionsmodus**
- Button, der das 10-s-Auto-Update kurz anhält, damit man einen Verlauf in Ruhe ansehen kann, ohne dass das Fenster wegwandert

**PNG-Export des Charts**
- ECharts `getDataURL()`; ein "Bild speichern"-Button liefert das Diagramm als PNG für Berichte/Mails
- Ergänzt den CSV-Export um die visuelle Variante


**Letzter Messwert Zeitpunkt fehlt aktuell**

**Hinzufügen Durchschnitt, Min, Max, bei anklicken vergrößern und hintergrund unscharf machen**