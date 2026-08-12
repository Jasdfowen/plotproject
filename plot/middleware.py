from django.shortcuts import redirect

# Pfad-Präfixe, die ohne Login erreichbar sind (Login-Seite, statische Dateien).
EXEMPT_PREFIXES = ['/login/', '/static/']

class RequireLoginMiddleware:
    """Erzwingt Login für alle Views außer Pfaden unter EXEMPT_PREFIXES."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        exempt = any(request.path.startswith(p) for p in EXEMPT_PREFIXES)
        if request.user.is_authenticated or exempt:
            return self.get_response(request)
        return redirect('login')


class KioskModeMiddleware:
    """Erkennt den Kiosk-Betrieb an ?kiosk=1 und merkt sich das dauerhaft in der Session.

    So bleibt der Kiosk-Zustand über Redirects (Login, Redirect-after-POST) und Klicks
    erhalten, obwohl der URL-Parameter selbst nur einmal da ist. ?kiosk=0 hebt ihn wieder auf.
    """

    # Pfad-Präfixe, die im Kiosk-Modus nicht erreichbar sein sollen (Aufrufe → zurück aufs Dashboard).
    BLOCKED = ('/sensor-management/', '/export-csv/', '/admin/')

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        flag = request.GET.get('kiosk')
        if flag == '1':
            request.session['kiosk_mode'] = True
        elif flag == '0':
            request.session['kiosk_mode'] = False

        if request.session.get('kiosk_mode') and request.path.startswith(self.BLOCKED):
            return redirect('chart')

        return self.get_response(request)