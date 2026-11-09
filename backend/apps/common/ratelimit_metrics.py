"""Rate-limit observability: the ``ratelimit.limited`` counter (SJR R3-a/R3-b).

Labels are ``scope`` and ``key_kind`` (``ip`` or ``user``) only. Never an
address, user id or any other identifier. Emission never raises.
"""
from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

COUNTER_NAME = "ratelimit.limited"
KEY_KINDS = frozenset({"ip", "user"})
_SCOPE_RE = re.compile(r"^[a-z0-9_.\-]{1,64}$")


def record_limited(scope: str, key_kind: str) -> None:
    """Count one refused request. ``scope`` is a route group or throttle scope."""
    try:
        if key_kind not in KEY_KINDS:
            logger.warning("ratelimit.metric.dropped_key_kind")
            return
        scope_s = str(scope).lower()
        if not _SCOPE_RE.match(scope_s):
            logger.warning("ratelimit.metric.dropped_scope")
            return
        tags = {"scope": scope_s, "key_kind": key_kind}
        try:
            import sentry_sdk

            metrics_mod = getattr(sentry_sdk, "metrics", None)
            if metrics_mod is not None and hasattr(metrics_mod, "incr"):
                metrics_mod.incr(COUNTER_NAME, 1, tags=tags)
        except Exception:  # pragma: no cover - defensive
            logger.warning("ratelimit.metric.sentry_failed")
        logger.info(
            "ratelimit_metric",
            extra={"type": "metric", "metric": COUNTER_NAME, "amount": 1, "tags": tags},
        )
    except Exception:  # pragma: no cover - never break request handling
        pass
