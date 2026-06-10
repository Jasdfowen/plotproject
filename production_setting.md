# Django Server Setup mit Nginx & Gunicorn (WSL)

## Architektur

```
Browser / Gerät im Netzwerk
        ↓
    Nginx (Port 80)       ← Türsteher, liefert statische Dateien aus
        ↓
    Gunicorn (Port 8000)  ← Übersetzer zwischen Nginx und Django
        ↓
    Django (mysite)       ← Die eigentliche App
        ↓
    SQLite Datenbank      ← Speichert die Temperaturdaten
```

---

## Projektstruktur

```
~/projekt/
├── venv/                        ← Virtuelles Python Environment
└── plotproject/                 ← Projektordner
    ├── manage.py
    ├── db.sqlite3
    ├── mysite/                  ← Django Projektname
    │   ├── settings.py
    │   ├── urls.py
    │   └── wsgi.py              ← Einstiegspunkt für Gunicorn
    ├── plot/                    ← Django App
    │   ├── views.py
    │   ├── models.py
    │   └── static/plot/js/
    │       └── echarts_plot.js  ← Originale statische Dateien
    └── staticfiles/             ← Gesammelte statische Dateien (für Nginx)
```

---

## Einrichtung (Schritt für Schritt)

### 1. Virtual Environment erstellen

```bash
cd ~/projekt
python3 -m venv venv
source venv/bin/activate
```

Das venv isoliert Python-Pakete vom System. Wenn aktiv, sieht man `(venv)` am Anfang der Zeile.

### 2. Gunicorn installieren

```bash
pip install gunicorn
```

### 3. Nginx installieren

```bash
sudo apt update
sudo apt install nginx
```

### 4. Nginx konfigurieren

```bash
sudo nano /etc/nginx/sites-available/plotproject
```

Inhalt:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /static/ {
        alias /home/lukas/projekt/plotproject/staticfiles/;
    }
}
```

Aktivieren:

```bash
sudo rm /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/plotproject /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl start nginx
```

### 5. Django Settings anpassen

```python
# mysite/settings.py
ALLOWED_HOSTS = ['*']
DEBUG = False
STATIC_ROOT = BASE_DIR / 'staticfiles'
```

### 6. Datenbank migrieren

```bash
python manage.py migrate
```

### 7. Statische Dateien sammeln

```bash
python manage.py collectstatic --clear
```

Kopiert alle Dateien aus `plot/static/` nach `staticfiles/`, damit Nginx sie ausliefern kann.

---

## Server starten

```bash
cd ~/projekt/plotproject
source ../venv/bin/activate
gunicorn mysite.wsgi:application --bind 127.0.0.1:8000
```

Mit `Strg+C` stoppen.

### Was der Befehl bedeutet

| Teil | Bedeutung |
|---|---|
| `gunicorn` | Startet Gunicorn |
| `mysite.wsgi:application` | Einstiegspunkt: `mysite/wsgi.py`, Objekt `application` |
| `--bind 127.0.0.1:8000` | Lauscht nur lokal auf Port 8000 |

---

## Im Netzwerk erreichbar

### Nur auf dem eigenen PC

```
http://localhost
```

### Von anderen Geräten im Heimnetzwerk (WSL)

Da WSL eine eigene interne IP hat, braucht man einen Port-Forward in Windows.

Windows-IP herausfinden (Powershell):

```powershell
ipconfig
```

Port-Forward einrichten (Powershell als Administrator):

```powershell
netsh interface portproxy add v4tov4 listenport=80 listenaddress=0.0.0.0 connectport=80 connectaddress=172.19.214.232
```

Dann über `http://192.168.x.x` (Windows-IP) erreichbar.

---

## Häufige Befehle

```bash
# Venv aktivieren
source ~/projekt/venv/bin/activate

# Gunicorn starten
gunicorn mysite.wsgi:application --bind 127.0.0.1:8000

# Nginx neu laden (nach Konfigurationsänderungen)
sudo systemctl reload nginx

# Statische Dateien aktualisieren
python manage.py collectstatic --clear

# Nginx Konfiguration testen
sudo nginx -t
```

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Nginx zeigt Standard-Seite | `sudo rm /etc/nginx/sites-enabled/default` |
| 403 Forbidden auf statische Dateien | `chmod 755 /home/lukas` |
| 500 Internal Server Error | Gunicorn-Terminal prüfen, oder `DEBUG = True` in settings.py |
| Statische Dateien veraltet | `python manage.py collectstatic --clear` |
| Tabelle existiert nicht | `python manage.py migrate` |
