from django.shortcuts import redirect

EXEMPT_PATHS = ['/login/', 'static/']  # URLs, die keinen Login erfordern (z.B. Login-Seite, statische Dateien)

class RequireLoginMiddleware:
    """Middleware to require login for all views except those in EXEMPT_PATHS."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if  request.user.is_authenticated or request.path in EXEMPT_PATHS or request.path.startswith('/static/') :
            return self.get_response(request)
        return redirect('login')