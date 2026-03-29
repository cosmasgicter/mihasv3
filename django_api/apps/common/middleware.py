"""Middleware chain — stubs for project scaffold.

Full implementations in tasks 7.1–7.5.
"""


class SecurityHeadersMiddleware:
    """Set security headers on all responses. Stub."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)


class RequestIDMiddleware:
    """Generate/propagate X-Request-ID. Stub."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)


class RateLimitMiddleware:
    """Per-scope rate limiting. Stub."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)


class JWTAuthenticationMiddleware:
    """Extract JWT from cookies/Bearer. Stub."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)


class CSRFEnforcementMiddleware:
    """Custom CSRF token validation. Stub."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)


class AuditMiddleware:
    """Log state-changing operations. Stub."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)
