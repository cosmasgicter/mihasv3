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


def _humanize_operation_id(op_id: str, method: str) -> str:
    """Turn an operation_id like 'applications_amendments_create' into a
    human-readable summary like 'Create applications amendments'.

    Used as a fallback when views lack an explicit summary= on @extend_schema.
    """
    if not op_id:
        return ""
    verb_map = {
        "list": "List",
        "retrieve": "Retrieve",
        "create": "Create",
        "update": "Update",
        "partial_update": "Partially update",
        "destroy": "Delete",
    }
    # Split operation_id on underscores. Common format: domain_resource_verb[_suffix].
    parts = op_id.split("_")
    verb_key = None
    for candidate in parts[-1:] + parts[-2:-1]:  # last or second-to-last
        if candidate in verb_map:
            verb_key = candidate
            break
    if verb_key:
        parts = [p for p in parts if p != verb_key]
        resource = " ".join(parts).replace("-", " ")
        return f"{verb_map[verb_key]} {resource}".strip()
    # Fallback: verb by HTTP method
    http_verb_map = {
        "get": "Get",
        "post": "Submit",
        "put": "Update",
        "patch": "Partially update",
        "delete": "Delete",
    }
    verb = http_verb_map.get(method.lower(), "")
    resource = " ".join(parts).replace("-", " ")
    return f"{verb} {resource}".strip()


def auto_summary_from_operation_id(result, generator, request, public):
    """drf-spectacular postprocessing hook: generate a summary for any
    operation that lacks one, derived from the operationId and HTTP method.

    Explicit ``summary=`` on ``@extend_schema`` is always preserved. This hook
    only runs when summary is missing or empty.
    """
    paths = result.get("paths", {})
    for path, methods in paths.items():
        for method, op in methods.items():
            if method == "parameters" or not isinstance(op, dict):
                continue
            existing = (op.get("summary") or "").strip()
            if existing:
                continue
            op_id = op.get("operationId") or ""
            summary = _humanize_operation_id(op_id, method)
            if summary:
                op["summary"] = summary
    return result


# --- Default error-response shapes. Registered under ErrorResponse in the
# components section by the `ErrorResponseSerializer` declared elsewhere; we
# reference the $ref so we don't duplicate the schema.
_ERROR_REF = {
    "description": "",
    "content": {
        "application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}
    },
}

# Which error responses apply to which HTTP methods. GET rarely needs 400.
_DEFAULT_ERROR_CODES_BY_METHOD = {
    "get": ("401", "403", "404", "500"),
    "post": ("400", "401", "403", "404", "500"),
    "put": ("400", "401", "403", "404", "500"),
    "patch": ("400", "401", "403", "404", "500"),
    "delete": ("401", "403", "404", "500"),
}

# Paths that intentionally skip auth (public endpoints). We omit 401/403 there.
_PUBLIC_PATH_PREFIXES = (
    "/health/",
    "/api/v1/errors/report/",  # AllowAny + rate-limited
    "/api/v1/payments/webhook/lenco/",  # HMAC-validated, no auth
    "/api/v1/applications/track/",  # public tracking
    "/api/v1/auth/login/",
    "/api/v1/auth/register/",
    "/api/v1/auth/refresh/",
    "/api/v1/auth/forgot-password/",
    "/api/v1/auth/reset-password/",
    "/api/v1/auth/verify-email/",
)


def _is_public(path: str) -> bool:
    return any(path.startswith(p) for p in _PUBLIC_PATH_PREFIXES)


_ERROR_DESCRIPTIONS = {
    "400": "Bad request — validation error. Response body follows the platform error envelope.",
    "401": "Authentication required — missing or invalid credentials.",
    "403": "Forbidden — the authenticated user lacks permission for this action.",
    "404": "Resource not found.",
    "500": "Internal server error. Logged to GlitchTip.",
}


def auto_document_error_responses(result, generator, request, public):
    """Inject documented error responses on operations that don't declare them.

    Uses ``#/components/schemas/ErrorResponse`` as the response body schema.
    Explicit error responses declared via ``@extend_schema(responses={...})``
    are preserved - this hook only fills in gaps.
    """
    paths = result.get("paths", {})
    for path, methods in paths.items():
        is_public = _is_public(path)
        for method, op in methods.items():
            if method == "parameters" or not isinstance(op, dict):
                continue
            responses = op.setdefault("responses", {})
            codes = _DEFAULT_ERROR_CODES_BY_METHOD.get(method.lower(), ())
            for code in codes:
                if is_public and code in ("401", "403"):
                    continue
                if code in responses:
                    # Already declared by the view's @extend_schema - preserve.
                    continue
                responses[code] = {
                    "description": _ERROR_DESCRIPTIONS.get(code, ""),
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                        }
                    },
                }
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
