def kiosk_mode(request):
    """Stellt das Kiosk-Flag aus der Session in ALLEN Templates als {{ kiosk_mode }} bereit.

    Wird von Django bei jedem Template-Rendering automatisch aufgerufen (Registrierung in
    settings.py unter TEMPLATES → OPTIONS → context_processors). Der Standard False gilt,
    solange KioskModeMiddleware das Flag nicht gesetzt hat.
    """
    return {'kiosk_mode': request.session.get('kiosk_mode', False)}
