"""Central registry of canonical V2 error codes.

Every ``/api/v2/`` error response carries a **stable** ``code`` from this
registry, a **user-safe** ``message``, and a ``retryable`` flag. The registry
is the single source of truth for the HTTP status a code maps to, so views and
domain services never invent ad-hoc ``(status, message)`` pairs.

Design references:
- ``design.md`` §14.1 (error envelope) and §14.2 (idempotency/conflict).
- Requirement R14.1 (stable code + human-safe message + request id).
- Finding API-01 (nested vs string error variants must not coexist).

Adding a code:
    ``register_error_code(V2ErrorCode("MY_CODE", 409, "Human-safe message.",
    retryable=False))``
Every registered code must have a contract test (see
``backend/tests/contract/test_v2_error_codes.py``).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class V2ErrorCode:
    """One registered error code.

    Attributes:
        code: Stable machine string (SCREAMING_SNAKE_CASE) the frontend switches
            on. Never reworded once shipped.
        http_status: The HTTP status this code is returned with.
        message: A user-safe default message. Views may override with a more
            specific (still user-safe) message, but never with internal detail.
        retryable: Whether a client may safely retry the same request. Provider
            outages and rate limits are retryable; validation and permission
            failures are not.
    """

    code: str
    http_status: int
    message: str
    retryable: bool = False


def _seed(*codes: V2ErrorCode) -> dict[str, V2ErrorCode]:
    registry: dict[str, V2ErrorCode] = {}
    for entry in codes:
        registry[entry.code] = entry
    return registry


# ---------------------------------------------------------------------------
# The canonical registry.
# ---------------------------------------------------------------------------
#
# Grouped by the response category each supports:
#   * transport/auth   — produced by the shared exception handler
#   * validation       — 400 with per-field errors
#   * conflict         — 409 idempotency/version/state conflicts
#   * configuration    — tenant/catalog/fee configuration gaps
#   * provider         — external side-effect (payment/storage/domain) failures
#   * fallback         — the last-resort internal error
V2_ERROR_CODES: dict[str, V2ErrorCode] = _seed(
    # --- transport / auth -------------------------------------------------
    V2ErrorCode(
        "VALIDATION_ERROR",
        400,
        "The submitted data is invalid. Please correct the highlighted fields.",
        retryable=False,
    ),
    V2ErrorCode(
        "AUTHENTICATION_REQUIRED",
        401,
        "You need to sign in to continue.",
        retryable=False,
    ),
    V2ErrorCode(
        "INSUFFICIENT_PERMISSIONS",
        403,
        "You do not have permission to perform this action.",
        retryable=False,
    ),
    V2ErrorCode(
        "NOT_FOUND",
        404,
        "The requested resource was not found.",
        retryable=False,
    ),
    V2ErrorCode(
        "METHOD_NOT_ALLOWED",
        405,
        "That action is not supported on this resource.",
        retryable=False,
    ),
    V2ErrorCode(
        "RATE_LIMITED",
        429,
        "Too many requests. Please wait a moment and try again.",
        retryable=True,
    ),
    # --- conflict ---------------------------------------------------------
    V2ErrorCode(
        "CONFLICT",
        409,
        "This action conflicts with the current state of the resource.",
        retryable=False,
    ),
    V2ErrorCode(
        "VERSION_CONFLICT",
        409,
        "This resource changed since you loaded it. Please reload and try again.",
        retryable=False,
    ),
    V2ErrorCode(
        "IDEMPOTENCY_KEY_CONFLICT",
        409,
        "This request was already submitted with different content.",
        retryable=False,
    ),
    # --- configuration ----------------------------------------------------
    V2ErrorCode(
        "FEE_NOT_CONFIGURED",
        422,
        "The application fee is not configured for this option.",
        retryable=False,
    ),
    V2ErrorCode(
        "CONFIGURATION_UNAVAILABLE",
        503,
        "This option is temporarily unavailable. Please try again shortly.",
        retryable=True,
    ),
    V2ErrorCode(
        "INSTITUTION_OVERRIDE_NOT_PERMITTED",
        403,
        "The requested institution does not match this site.",
        retryable=False,
    ),
    # --- provider ---------------------------------------------------------
    V2ErrorCode(
        "PROVIDER_UNAVAILABLE",
        503,
        "An external service is temporarily unavailable. Please try again shortly.",
        retryable=True,
    ),
    V2ErrorCode(
        "SERVICE_UNAVAILABLE",
        503,
        "The service is temporarily unavailable. Please try again shortly.",
        retryable=True,
    ),
    # --- fallback ---------------------------------------------------------
    V2ErrorCode(
        "INTERNAL_ERROR",
        500,
        "An unexpected error occurred. Please try again later.",
        retryable=False,
    ),
)


def get_error_code(code: str) -> V2ErrorCode:
    """Return the registered :class:`V2ErrorCode`, or the INTERNAL_ERROR entry.

    Unknown codes never crash the response path; they degrade to a generic
    500-class internal error so a mislabelled code cannot leak a stack trace.
    """

    return V2_ERROR_CODES.get(code, V2_ERROR_CODES["INTERNAL_ERROR"])


def register_error_code(entry: V2ErrorCode) -> None:
    """Register a new error code.

    Raises:
        ValueError: if ``entry.code`` is already registered with different
            attributes (prevents silent redefinition/drift).
    """

    existing = V2_ERROR_CODES.get(entry.code)
    if existing is not None and existing != entry:
        raise ValueError(
            f"Error code {entry.code!r} is already registered with different "
            f"attributes; refusing to redefine it."
        )
    V2_ERROR_CODES[entry.code] = entry
