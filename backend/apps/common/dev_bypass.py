"""Dev-bypass lockout primitives for payment views.

This module is the single source of truth for production lockout of any
``dev-bypass``-style testing affordance on payment endpoints. The design
(``.kiro/specs/payment-hardening/design.md``, Security Considerations →
Dev-Bypass Lockout, Req 16) pins this file as the sole location for:

1. The **sets** of recognised dev-bypass parameter names and header names.
2. A **detector** - :func:`is_dev_bypass_attempted` - which scans a Django
   ``HttpRequest`` / DRF ``Request`` for any known vector.
3. A **decorator** - :func:`require_not_dev_bypass_in_production` - which
   short-circuits decorated view methods with HTTP 404 under production
   settings (``DEBUG is False`` OR ``DJANGO_ENV == 'production'``) whenever
   a dev-bypass vector is present, and otherwise emits a
   ``payment.dev_bypass_used`` audit event before letting the view run.

The decorator supports both plain view functions and class-based view
methods (i.e. ``def post(self, request, ...)`` and ``def get(self, request,
...)``). It detects a bound method by looking at the first positional
argument: if it isn't the ``request`` object, we assume the first arg is
``self``.

See: Requirements R16.1, R16.2, R16.3.
"""

from __future__ import annotations

import logging
from functools import wraps
from typing import Any, Callable, Iterable

from django.conf import settings
from django.http import HttpResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Recognised vectors - the exact names the decorator looks for
# ---------------------------------------------------------------------------

#: Parameter names that may appear in the query string or request body.
#: Matched case-sensitively against the raw key because query-string keys
#: are case-sensitive on the wire and frontend clients only ever send the
#: documented forms. This set is frozen so it can be used safely as a
#: module-level constant.
DEV_BYPASS_PARAM_NAMES: frozenset[str] = frozenset(
    {
        "dev-bypass",
        "dev_bypass",
        "DEV_BYPASS_AUTH",
        "dev",
    }
)

#: Header names that may appear on inbound requests. Matched
#: case-insensitively via the Django ``META`` translation
#: (``HTTP_<UPPER_WITH_UNDERSCORES>``).
DEV_BYPASS_HEADER_NAMES: frozenset[str] = frozenset(
    {
        "X-Dev-Bypass-Auth",
        "X-Dev-Bypass",
    }
)


def _header_name_to_meta_key(name: str) -> str:
    """Convert an HTTP header name to its Django ``request.META`` key.

    ``X-Dev-Bypass-Auth`` → ``HTTP_X_DEV_BYPASS_AUTH``.
    """
    return "HTTP_" + name.upper().replace("-", "_")


_DEV_BYPASS_META_KEYS: frozenset[str] = frozenset(
    _header_name_to_meta_key(name) for name in DEV_BYPASS_HEADER_NAMES
)


def _iter_candidate_mappings(request: Any) -> Iterable[tuple[str, Any]]:
    """Yield ``(kind, mapping)`` pairs to scan for bypass keys.

    Accessing ``request.data`` can force DRF to parse the body, which may
    raise on malformed payloads. We swallow parsing errors so the detector
    is always safe to call - missing data never masks a bypass attempt but
    must also never crash the request path.
    """
    get = getattr(request, "GET", None)
    if get is not None:
        yield "query", get

    # DRF ``request.data`` (parsed body, when the view is DRF-based).
    # Cache the raw Django body first so downstream HMAC-verifying views can
    # still read the exact bytes after this detector inspects parsed data.
    try:
        raw_request = getattr(request, "_request", request)
        _ = raw_request.body
    except Exception:
        pass
    try:
        data = getattr(request, "data", None)
    except Exception:  # pragma: no cover - DRF raises on unparseable body
        data = None
    if data is not None:
        yield "body", data

    post = getattr(request, "POST", None)
    if post is not None:
        yield "body", post


def is_dev_bypass_attempted(request: Any) -> bool:
    """Return ``True`` when any known dev-bypass vector is present on ``request``.

    The function checks, in order:

    1. Query-string keys (``request.GET``) against
       :data:`DEV_BYPASS_PARAM_NAMES`.
    2. DRF body keys (``request.data``) and Django POST keys
       (``request.POST``) against :data:`DEV_BYPASS_PARAM_NAMES`.
    3. HTTP headers (``request.META``) against
       :data:`DEV_BYPASS_HEADER_NAMES`.

    Only the **presence** of a recognised key matters; the value is never
    inspected or logged to keep dev-bypass attempts out of any structured
    logs. Ill-formed bodies (JSON parse errors etc.) are treated as "no
    vector" rather than crashing the detector.
    """
    if request is None:
        return False

    # Query string + body (parsed) + Django POST
    for _kind, mapping in _iter_candidate_mappings(request):
        try:
            keys = mapping.keys() if hasattr(mapping, "keys") else []
        except Exception:  # pragma: no cover - mapping-like but unreadable
            continue
        for key in keys:
            if not isinstance(key, str):
                continue
            if key in DEV_BYPASS_PARAM_NAMES:
                return True

    # Headers
    meta = getattr(request, "META", None)
    if meta is not None:
        for meta_key in _DEV_BYPASS_META_KEYS:
            if meta_key in meta:
                return True

    return False


# ---------------------------------------------------------------------------
# Production detection
# ---------------------------------------------------------------------------


def _is_production() -> bool:
    """Return ``True`` when the current settings match production posture.

    We treat the environment as production when **either** ``DEBUG`` is
    ``False`` **or** ``DJANGO_ENV`` is ``'production'``. This mirrors the
    spec's disjunction (R16.1) so that staging/QA deployments that keep
    ``DEBUG=False`` but use a non-production ``DJANGO_ENV`` still lock out
    dev-bypass vectors - the safest default for a production-facing
    surface.
    """
    debug = bool(getattr(settings, "DEBUG", False))
    django_env = str(getattr(settings, "DJANGO_ENV", "") or "").strip().lower()
    return (not debug) or django_env == "production"


# ---------------------------------------------------------------------------
# Decorator
# ---------------------------------------------------------------------------


def _extract_request(args: tuple) -> tuple[Any, bool]:
    """Return ``(request, is_method)`` from a view callable's ``args``.

    The decorator is used on both plain view functions
    (``def view(request, ...)``) and class-based view methods
    (``def post(self, request, ...)``). We detect the difference by
    looking for a ``META`` attribute on the first positional argument: a
    real Django/DRF request object always has it, while ``self`` does not.
    """
    if not args:
        return None, False
    first = args[0]
    if hasattr(first, "META") or hasattr(first, "method"):
        return first, False
    if len(args) >= 2 and (hasattr(args[1], "META") or hasattr(args[1], "method")):
        return args[1], True
    return None, False


def _emit_audit(request: Any) -> None:
    """Emit a ``payment.dev_bypass_used`` audit event for non-prod attempts.

    The audit row carries the actor identity, the actor role (when
    available), and the request path/method. The **value** of the
    dev-bypass vector is never included in the metadata - we log only
    that a vector was used, never the opaque payload that was supplied.
    """
    try:
        from apps.documents.payment_audit_service import PaymentAuditService
    except Exception:  # pragma: no cover - defensive
        logger.warning(
            "dev_bypass audit: PaymentAuditService unavailable", exc_info=True
        )
        return

    user = getattr(request, "user", None)
    actor_id = getattr(user, "id", None) if user is not None else None
    is_authenticated = bool(getattr(user, "is_authenticated", False))
    actor_role = (
        getattr(user, "role", None) if user is not None and is_authenticated else None
    )

    path = getattr(request, "path", "") or ""
    method = getattr(request, "method", "") or ""

    metadata = {
        "path": path,
        "method": method,
    }

    try:
        PaymentAuditService.record_payment_event(
            action="payment.dev_bypass_used",
            payment_id=None,
            actor_id=actor_id if is_authenticated else None,
            actor_role=actor_role,
            metadata=metadata,
            request=request,
        )
    except Exception:
        # Never propagate audit-writer failures - the request continues.
        logger.warning(
            "dev_bypass audit: failed to record payment.dev_bypass_used",
            exc_info=True,
        )


def require_not_dev_bypass_in_production(
    view_method: Callable[..., Any],
) -> Callable[..., Any]:
    """Decorator - lock out dev-bypass vectors on production payment views.

    Behaviour:

    * **Production** (``DEBUG is False`` OR ``DJANGO_ENV == 'production'``):
      if any known dev-bypass vector (query param, body field, or header)
      is present, short-circuit with a bare ``HttpResponse(status=404)``
      - no body, no envelope - indistinguishable from a missing route.
    * **Non-production**: when a vector is present, emit
      ``PaymentAuditService.record_payment_event(
      action='payment.dev_bypass_used', ...)`` with the actor identity
      and ``{'path', 'method'}`` metadata, then call the view as usual.
      Dev-bypass in non-production does **not** alter routing - it is
      only observable in the audit trail.

    Works for both ``def view(request, ...)`` and
    ``def method(self, request, ...)`` signatures.
    """

    @wraps(view_method)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        request, _is_method = _extract_request(args)
        if request is None:
            # Nothing to inspect - fall through to the view so behaviour
            # is unchanged for edge cases we don't recognise.
            return view_method(*args, **kwargs)

        if is_dev_bypass_attempted(request):
            if _is_production():
                # Production lockout - bare 404, no body, no envelope.
                return HttpResponse(status=404)
            # Non-production - audit and continue.
            _emit_audit(request)

        return view_method(*args, **kwargs)

    return wrapper


__all__ = [
    "DEV_BYPASS_PARAM_NAMES",
    "DEV_BYPASS_HEADER_NAMES",
    "is_dev_bypass_attempted",
    "require_not_dev_bypass_in_production",
]
