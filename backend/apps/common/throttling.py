"""Payment-hardening rate-limiting primitives.

This module is the single source of truth for the DRF ``ScopedRateThrottle``
subclass used by every payment endpoint:

* ``PaymentUserScopedRateThrottle`` — keys a throttle bucket by
  ``request.user.pk`` for authenticated requests and by
  ``self.get_ident(request)`` (client IP) for anonymous requests. This
  matches the design's R19.2 rule: authenticated endpoints budget per
  user, unauthenticated endpoints (currently only ``resolve-fee`` when
  the user is not signed in) budget per IP.

Gate behaviour:

* When ``settings.PAYMENT_HARDENING_RATE_LIMITS`` is ``False`` the
  throttle is a no-op — ``get_cache_key`` returns ``None`` so DRF skips
  the bucket entirely. Views can therefore always list this throttle
  class in ``throttle_classes`` and the pre-hardening behaviour is
  preserved bit-exact until the flag is flipped (R22.6).

Bucket-key format:

    throttle_{scope}_user_{pk_or_ip}

Under DRF the full cache key gains the ``throttle_`` prefix via
``SimpleRateThrottle.cache_format``. We therefore return only the
``{scope}_user_{pk_or_ip}`` suffix from ``get_cache_key`` — DRF itself
prepends the ``throttle_`` literal. The effective Redis/LocMem key is:

    throttle_<scope>_user_<pk_or_ip>

which matches the format documented above.

Validates: Requirements R19.1, R19.2.
"""

from __future__ import annotations

from typing import Any, Optional

from django.conf import settings
from rest_framework.throttling import ScopedRateThrottle


class PaymentUserScopedRateThrottle(ScopedRateThrottle):
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
       anonymous users — instead of the base class's mixed
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


__all__ = ["PaymentUserScopedRateThrottle"]
