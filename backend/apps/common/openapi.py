"""OpenAPI extensions and shared schema helpers."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


# --- URL-prefix → domain tag mapping used by the `auto_tag_by_url_prefix`
# postprocessing hook. More specific prefixes first.
_URL_PREFIX_TAG_MAP = (
    ("/api/v1/admin/", "admin"),
    ("/api/v1/applications/", "applications"),
    ("/api/v1/auth/", "auth"),
    ("/api/v1/sessions/", "sessions"),
    ("/api/v1/catalog/", "catalog"),
    ("/api/v1/documents/", "documents"),
    ("/api/v1/payments/", "payments"),
    ("/api/v1/programs/", "catalog"),  # program_fees endpoints live under /programs/{id}/fees/
    ("/api/v1/notifications/", "notifications"),
    ("/api/v1/email/", "email"),
    ("/api/v1/errors/", "errors"),
    ("/api/v1/jobs/", "jobs"),
    ("/api/v1/job-applications/", "job-applications"),
    ("/api/v1/outreach/", "outreach"),
    ("/api/v1/automation/", "automation"),
    ("/api/v1/integrations/", "integrations"),
    ("/api/v1/analytics/", "analytics"),
    ("/api/v1/reports/", "reports"),
    ("/api/v1/meta/", "meta"),
    ("/health/", "health"),
)


def _tag_for_path(path: str) -> str | None:
    for prefix, tag in _URL_PREFIX_TAG_MAP:
        if path.startswith(prefix):
            return tag
    return None


def auto_tag_by_url_prefix(result, generator, request, public):
    """drf-spectacular postprocessing hook: replace default `api` tag with a
    domain tag derived from the URL prefix.

    This is a safety net for views that were not annotated with an explicit
    ``tags=[...]`` kwarg on ``@extend_schema``. Views that ARE explicitly
    tagged keep their tags unchanged.
    """
    paths = result.get("paths", {})
    for path, methods in paths.items():
        tag = _tag_for_path(path)
        if not tag:
            continue
        for method, op in methods.items():
            if method == "parameters" or not isinstance(op, dict):
                continue
            tags = op.get("tags") or []
            # If the only tag is the drf-spectacular default "api" (or no tags at all),
            # replace with our derived domain tag. Otherwise leave explicit tags alone.
            if not tags or tags == ["api"]:
                op["tags"] = [tag]
    return result


class JWTCookieAuthenticationScheme(OpenApiAuthenticationExtension):
    """Describe the primary JWT auth backend for generated API docs.

    Applies to endpoints that REQUIRE authentication. For the optional-auth
    variant (``OptionalJWTCookieAuthentication``, used by ``SessionView`` and
    a few public catalog endpoints), see
    ``OptionalJWTCookieAuthenticationScheme`` below.
    """

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


class OptionalJWTCookieAuthenticationScheme(OpenApiAuthenticationExtension):
    """Describe the optional-cookie authenticator used by public endpoints.

    ``OptionalJWTCookieAuthentication`` (applied to ``SessionView`` and a few
    public catalog endpoints) accepts *but does not require* a valid JWT. The
    generated schema reflects this by offering two schemes plus an empty
    security requirement (the empty dict signals "no auth also works").

    We register distinct scheme names (``optionalJwtBearerAuth`` /
    ``optionalJwtCookieAuth``) rather than reusing ``jwtBearerAuth`` /
    ``jwtCookieAuth`` to avoid drf-spectacular's
    ``components with identical names and different identities`` warning.
    The descriptions reference the same underlying tokens.
    """

    target_class = "apps.accounts.authentication.OptionalJWTCookieAuthentication"
    name = ["optionalJwtBearerAuth", "optionalJwtCookieAuth"]
    priority = 1

    def get_security_requirement(self, auto_schema):
        return [
            {"optionalJwtBearerAuth": []},
            {"optionalJwtCookieAuth": []},
        ]

    def get_security_definition(self, auto_schema):
        return [
            {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": (
                    "Optional bearer token. If present and valid, the request "
                    "is authenticated; otherwise it is treated as anonymous."
                ),
            },
            {
                "type": "apiKey",
                "in": "cookie",
                "name": "access_token",
                "description": (
                    "Optional session cookie. If present and valid, the request "
                    "is authenticated; otherwise it is treated as anonymous."
                ),
            },
        ]
