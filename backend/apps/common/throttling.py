"""Payment-hardening rate-limiting primitives.

This module is the single source of truth for the DRF ``ScopedRateThrottle``
subclass used by every payment endpoint:

* ``PaymentUserScopedRateThrottle`` - keys a throttle bucket by
  ``request.user.pk`` for authenticated requests and by
  ``self.get_ident(request)`` (client IP) for anonymous requests. This
  matches the design's R19.2 rule: authenticated endpoints budget per
  user, unauthenticated endpoints (currently only ``resolve-fee`` when
  the user is not signed in) budget per IP.

Gate behaviour:

* When ``settings.PAYMENT_HARDENING_RATE_LIMITS`` is ``False`` the
  throttle is a no-op - ``get_cache_key`` returns ``None`` so DRF skips
  the bucket entirely. Views can therefore always list this throttle
  class in ``throttle_classes`` and the pre-hardening behaviour is
  preserved bit-exact until the flag is flipped (R22.6).

Bucket-key format:

    throttle_{scope}_user_{pk_or_ip}

Under DRF the full cache key gains the ``throttle_`` prefix via
``SimpleRateThrottle.cache_format``. We therefore return only the
``{scope}_user_{pk_or_ip}`` suffix from ``get_cache_key`` - DRF itself
prepends the ``throttle_`` literal. The effective Redis/LocMem key is:

    throttle_<scope>_user_<pk_or_ip>

which matches the format documented above.

Validates: Requirements R19.1, R19.2.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from django.conf import settings
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle

from apps.common.request_utils import get_client_ip

logger = logging.getLogger(__name__)


class ClientIpIdentMixin:
    """Identify an anonymous client by the trusted-proxy aware address.

    DRF's own ``get_ident`` keys on the whole ``X-Forwarded-For`` chain when
    ``NUM_PROXIES`` is not in ``REST_FRAMEWORK``, which lets a caller mint a
    fresh bucket per request. ``get_client_ip`` honours ``TRUSTED_PROXY_CIDRS``
    and ``NUM_PROXIES`` (SJR R3-a). Authenticated keys stay ``user.pk``.
    """

    def get_ident(self, request: Any) -> str:
        return get_client_ip(request)


class PaymentUserScopedRateThrottle(ClientIpIdentMixin, ScopedRateThrottle):
    """Per-user (fallback IP) scoped throttle for payment endpoints.

    The scope name is read from the view's ``throttle_scope`` attribute
    exactly like the stock ``ScopedRateThrottle``. The only deviations
    from the base class are:

    1. ``get_cache_key`` returns ``None`` whenever
       ``settings.PAYMENT_HARDENING_RATE_LIMITS`` is falsy, making this
       throttle a no-op behind the payment-hardening flag.
    2. When enabled, the cache key is explicitly keyed by
       ``user.pk`` for authenticated users and by
       ``self.get_ident(request)`` (client IP, respecting
       ``X-Forwarded-For`` via ``NUM_PROXIES`` conventions) for
       anonymous users - instead of the base class's mixed
       authenticated/anonymous keying.
    """

    #: DRF's ``SimpleRateThrottle`` uses this to prefix the cache key with
    #: ``throttle_``. We keep the default, so the effective cache key is
    #: ``throttle_<scope>_user_<pk_or_ip>``.
    cache_format = "throttle_%(scope)s_user_%(ident)s"

    def get_cache_key(self, request: Any, view: Any) -> Optional[str]:
        # Gate: when the hardening flag is off, skip throttling entirely.
        if not getattr(settings, "PAYMENT_HARDENING_RATE_LIMITS", False):
            return None

        # ``ScopedRateThrottle.allow_request`` populates ``self.scope`` from
        # the view's ``throttle_scope`` attribute before delegating to
        # ``get_cache_key``. Fall back to the view attribute directly so
        # this method is safe to call in isolation (e.g. from tests).
        scope = getattr(self, "scope", None) or getattr(view, "throttle_scope", None)
        if not scope:
            return None

        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            ident = str(getattr(user, "pk", None) or getattr(user, "id", ""))
        else:
            ident = self.get_ident(request)

        return self.cache_format % {"scope": scope, "ident": ident}


__all__ = [
    "ClientIpIdentMixin",
    "DocumentUserRateThrottle",
    "PaymentUserScopedRateThrottle",
    "DocumentExtractUserScopedRateThrottle",
    "PublicTrackingFailureThrottle",
]


class DocumentExtractUserScopedRateThrottle(ClientIpIdentMixin, ScopedRateThrottle):
    """Per-user (fallback IP) scoped throttle for the document-extraction retry.

    admissions-v2 task 7.4 (R11.9) retired the AI-scoped throttle this replaces.
    The endpoint it protects — ``POST /api/v1/documents/{id}/extract/`` — now runs
    **local** OCR with no model call, so an AI-named throttle and an AI-named flag
    no longer describe anything real. The cap itself is still needed and is kept
    bit-for-bit: repeated ``force=True`` re-extract calls are CPU-expensive and
    remain a denial-of-service lever.

    Gate: ``settings.DOCUMENT_EXTRACT_RATE_LIMITS``. When off, ``get_cache_key``
    returns ``None`` so the throttle is a no-op — the same rollout mechanics as
    the payment throttle.

    Cache key format: ``throttle_<scope>_extract_user_<pk_or_ip>``.
    """

    cache_format = "throttle_%(scope)s_extract_user_%(ident)s"

    def get_cache_key(self, request, view):  # type: ignore[override]
        if not getattr(settings, "DOCUMENT_EXTRACT_RATE_LIMITS", False):
            return None
        scope = getattr(self, "scope", None) or getattr(view, "throttle_scope", None)
        if not scope:
            return None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            ident = str(getattr(user, "pk", None) or getattr(user, "id", ""))
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": scope, "ident": ident}


class PublicTrackingFailureThrottle(ClientIpIdentMixin, SimpleRateThrottle):
    """Per-IP **failed-attempt** budget for the unauthenticated public tracker.

    admissions-v2 task 10.5 (R13.12 "rate-limit attempts", R17.7, STU-22).

    Why a failure budget rather than a request budget
    ------------------------------------------------
    ``RateLimitMiddleware`` already bounds *requests* to
    ``/api/v1/applications/track/`` at 20/10m per IP, and that stays. It cannot
    be the enumeration control, though, because it spends the same budget on a
    student refreshing their own status as on someone guessing: tightening it
    enough to stop a search would break the legitimate use, and leaving it loose
    enough for the legitimate use leaves a search affordable.

    This throttle counts **only attempts that failed to resolve**. A holder of a
    valid link never touches it; a guesser reaches the wall almost immediately.

    Consequently the bucket is *not* recorded in :meth:`allow_request` — that
    only reads the history — and the view calls :meth:`record_failure` after a
    lookup comes back empty. The failure classes are deliberately merged: an
    unknown selector, a revoked secret, a wrong verifier and a tenant-host
    mismatch all count the same, because the endpoint answers all four
    identically and a differentiated budget would leak which one happened.

    The budget gates the **refusal**, not the request
    ------------------------------------------------
    :meth:`allow_request` therefore never returns ``False``. A spent budget must
    not stop a *correct* token from resolving, because the address is shared:
    a school computer room, an internet café, or any NAT is one client here, and
    refusing the holder because a stranger behind the same address was guessing
    denies the tracker's entire purpose for an hour. It also buys nothing — the
    verifier is 100 random bits, so answering a correct token discloses nothing
    to whoever was guessing.

    So the view asks :meth:`is_exhausted` **after** a lookup has already failed,
    and only then is the caller told 429. An enumerator gets at most
    ``num_requests`` informative refusals per window and nothing but 429s after
    that; the holder is never affected. The coarse
    ``RateLimitMiddleware`` request budget (20/10m on the same path) is what
    bounds the raw request flood.

    Client identity is not caller-controlled
    ----------------------------------------
    The key comes from :func:`apps.common.request_utils.get_client_ip`, which
    counts ``NUM_PROXIES`` (default 1) entries **from the right** of
    ``X-Forwarded-For``. DRF's own ``get_ident`` is not used: ``NUM_PROXIES``
    lives in Django settings and not in the ``REST_FRAMEWORK`` dict, so
    ``api_settings.NUM_PROXIES`` is ``None`` and ``get_ident`` would key on the
    **whole** forwarded chain — letting a caller mint a fresh budget per request
    with one spoofed header, which would make this budget decorative.

    A **recognised-but-not-authoritative** identifier (an application number, a
    legacy tracking code) does *not* count: it never reaches the database, so it
    is not an attempt at anything. Charging for it would let a bystander pasting
    the number from their own slip exhaust their own budget.

    Gate: ``settings.PUBLIC_TRACKING_RATE_LIMITS``, default **True**. Unlike the
    payment and document-extract throttles this defaults on, because it is the
    boundary of an unauthenticated endpoint rather than an abuse control on an
    authenticated one — an operator can still disable it, but not by omission.
    """

    scope = "public_tracking_failure"
    cache_format = "throttle_%(scope)s_ip_%(ident)s"

    def _enabled(self) -> bool:
        return bool(getattr(settings, "PUBLIC_TRACKING_RATE_LIMITS", True))

    def get_cache_key(self, request: Any, view: Any) -> Optional[str]:
        if not self._enabled():
            return None
        # Always IP-keyed: the endpoint is unauthenticated, and a signed-in
        # visitor using the public tracker is still the public.
        return self.cache_format % {
            "scope": self.scope,
            "ident": get_client_ip(request) or "unknown",
        }

    def allow_request(self, request: Any, view: Any) -> bool:
        """Load this client's failure history. Never refuses, never records.

        Always ``True``: the budget gates the *refusal*, which only the view can
        recognise, so it asks :meth:`is_exhausted` after a lookup has failed.
        This still populates ``key`` / ``history`` / ``now`` so
        :meth:`~rest_framework.throttling.SimpleRateThrottle.wait` reports a
        correct ``Retry-After``.
        """
        self.key = None
        self.history = []
        self.now = self.timer()
        if self.rate is None:
            return True
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True
        history = self.cache.get(self.key, [])
        while history and history[-1] <= self.now - self.duration:
            history.pop()
        self.history = history
        return True

    def is_exhausted(self, request: Any, view: Any = None) -> bool:
        """Has this client already spent its failed-attempt budget?"""
        if self.rate is None:
            return False
        if getattr(self, "key", None) is None:
            self.allow_request(request, view)
        if self.key is None:
            return False
        return len(self.history) >= self.num_requests

    def record_failure(self, request: Any, view: Any = None) -> None:
        """Charge one failed attempt against this client's budget."""
        if self.rate is None:
            return
        key = getattr(self, "key", None) or self.get_cache_key(request, view)
        if key is None:
            return
        now = self.timer()
        history = self.cache.get(key, [])
        while history and history[-1] <= now - self.duration:
            history.pop()
        history.insert(0, now)
        self.cache.set(key, history, self.duration)
        self.key = key
        self.history = history
        self.now = now


class DocumentUserRateThrottle(ClientIpIdentMixin, SimpleRateThrottle):
    """Per-user document budgets: reads separate from writes (SJR R3-b).

    Scope is ``documents_read`` for GET, HEAD and OPTIONS, else
    ``documents_write``, chosen in :meth:`allow_request` before the rate is
    parsed. Cache key ``throttle_<scope>_user_<user.pk>``, or the client
    address when anonymous. Inactive when ``RATELIMIT_ENABLE`` is false (read
    with a default, the way django-ratelimit reads it: the setting is only
    defined by test and harness settings). A cache failure fails open and logs
    a WARNING; the middleware's in-memory fallback still bounds abuse.
    """

    cache_format = "throttle_%(scope)s_user_%(ident)s"
    READ_METHODS = ("GET", "HEAD", "OPTIONS")

    def __init__(self) -> None:
        # The scope depends on the request method, so the rate is resolved in
        # allow_request rather than here.
        self.scope = "documents_read"
        self.rate = None

    def get_cache_key(self, request: Any, view: Any) -> Optional[str]:
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            ident = str(getattr(user, "pk", None) or getattr(user, "id", ""))
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def allow_request(self, request: Any, view: Any) -> bool:
        if not getattr(settings, "RATELIMIT_ENABLE", True):
            return True
        self.scope = (
            "documents_read" if request.method in self.READ_METHODS else "documents_write"
        )
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        try:
            return super().allow_request(request, view)
        except Exception:
            logger.warning("ratelimit.document_throttle.cache_unavailable", exc_info=True)
            return True
