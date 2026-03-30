"""OpenAPI extensions and shared schema helpers."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class JWTCookieAuthenticationScheme(OpenApiAuthenticationExtension):
    """Describe the custom JWT auth backend for generated API docs."""

    target_class = "apps.accounts.authentication.JWTCookieAuthentication"
    name = ["jwtBearerAuth", "jwtCookieAuth"]
    priority = 1

    def get_security_requirement(self, auto_schema):
        # Either a bearer token or the access_token cookie may authenticate a request.
        return [
            {"jwtBearerAuth": []},
            {"jwtCookieAuth": []},
        ]

    def get_security_definition(self, auto_schema):
        return [
            {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Use an access token for direct API testing.",
            },
            {
                "type": "apiKey",
                "in": "cookie",
                "name": "access_token",
                "description": "Session cookie issued by the login endpoint.",
            },
        ]
