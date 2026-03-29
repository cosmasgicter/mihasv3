"""JWT authentication backend — stub for project scaffold.

Full implementation in task 9.1.
"""

from rest_framework.authentication import BaseAuthentication


class JWTCookieAuthentication(BaseAuthentication):
    """Extract JWT from HTTP-only cookies or Authorization Bearer header.

    Stub — returns None (unauthenticated) until fully implemented.
    """

    def authenticate(self, request):
        return None
