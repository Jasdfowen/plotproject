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