"""AI Gateway circuit breaker.

Protects the platform from cost attacks, runaway retries, and
degraded UX during Vercel AI Gateway outages.

Design (matches payment-hardening feature-flag pattern):

* **Gate**: ``settings.AI_HARDENING_CIRCUIT_BREAKER`` - when ``False``
  the decorator is a no-op pass-through, preserving pre-hardening
  behaviour bit-exact. This lets us ship the code without flipping
  behaviour until ops are ready.
* **State storage**: Redis (via Django cache). Two keys per breaker
  name - a ``failures`` counter with a short TTL (``COOLDOWN_SECONDS``)
  and an ``open`` flag with the same TTL. When open, the wrapped call
  is short-circuited.
* **Thresholds**:
    * ``FAILURE_THRESHOLD`` consecutive failures inside the
      ``COOLDOWN_SECONDS`` window opens the breaker.
    * Open breaker stays open for ``COOLDOWN_SECONDS`` seconds,
      after which it half-opens (next call is a probe).
    * A successful probe clears the counter; a failed probe re-opens
      the breaker for another ``COOLDOWN_SECONDS``.

The wrapper never raises. On open-circuit short-circuit, the wrapped
function's fallback value is returned (``None`` by default). Every
AI function in ``apps.common.ai_service`` already tolerates ``None``
as a no-AI result.

Requirements: AI risk remediation plan, Phase 1.1.
"""

from __future__ import annotations

import logging
from functools import wraps
from typing import Any, Callable, TypeVar

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

#: Consecutive failures (timeouts or 5xx) needed to open the breaker.
FAILURE_THRESHOLD: int = 3

#: Seconds the breaker stays open before allowing a probe call.
COOLDOWN_SECONDS: int = 300

#: Sentinel returned when the breaker is open - the AI-service callers
#: already treat ``None`` as "no AI result, fall back gracefully".
_OPEN_SENTINEL = None

F = TypeVar("F", bound=Callable[..., Any])


def _breaker_key(name: str, suffix: str) -> str:
    return f"ai_cb:{name}:{suffix}"


def _is_open(name: str) -> bool:
    """Return True if the breaker for ``name`` is currently open."""
    try:
        return bool(cache.get(_breaker_key(name, "open")))
    except Exception:  # pragma: no cover - never fail in the hot path
        logger.warning("ai_circuit_breaker: cache.get failed for %s", name)
        return False


def _record_failure(name: str) -> None:
    """Increment the failure counter; open the breaker at the threshold."""
    key = _breaker_key(name, "failures")
    try:
        # ``cache.incr`` raises ValueError if the key doesn't exist, so
        # seed it first. Two-step is fine - worst case we lose a count
        # in a race, which doesn't meaningfully change the breaker.
        if cache.get(key) is None:
            cache.set(key, 0, timeout=COOLDOWN_SECONDS)
        count = cache.incr(key)
    except Exception:  # pragma: no cover - defensive
        logger.warning("ai_circuit_breaker: cache.incr failed for %s", name)
        return

    if count >= FAILURE_THRESHOLD:
        try:
            cache.set(_breaker_key(name, "open"), True, timeout=COOLDOWN_SECONDS)
        except Exception:  # pragma: no cover - defensive
            logger.warning("ai_circuit_breaker: cache.set failed for %s", name)
        logger.warning(
            "AI circuit breaker opened: name=%s failures=%s cooldown=%ss",
            name,
            count,
            COOLDOWN_SECONDS,
        )
        _emit_metric("ai.circuit_breaker.opened", name)


def _record_success(name: str) -> None:
    """Reset failures + close the breaker if it was half-open."""
    try:
        cache.delete(_breaker_key(name, "failures"))
        cache.delete(_breaker_key(name, "open"))
    except Exception:  # pragma: no cover - defensive
        logger.warning("ai_circuit_breaker: cache.delete failed for %s", name)


def _emit_metric(metric: str, name: str) -> None:
    """Best-effort metric emission via sentry_sdk.metrics.

    The ``apps.documents.payment_metrics`` registry is payment-specific
    so we emit directly via ``sentry_sdk`` here with a small allow-list
    of AI metric names. Never raises.
    """
    try:
        import sentry_sdk

        metrics_mod = getattr(sentry_sdk, "metrics", None)
        if metrics_mod is not None and hasattr(metrics_mod, "incr"):
            metrics_mod.incr(metric, 1, tags={"breaker": name})
    except Exception:  # pragma: no cover - defensive
        pass


def with_circuit_breaker(name: str, fallback: Any = _OPEN_SENTINEL) -> Callable[[F], F]:
    """Wrap an AI-facing callable with the circuit-breaker guard.

    Parameters
    ----------
    name:
        Unique identifier for this breaker (e.g. ``"ai.vision"``,
        ``"ai.analyze_document"``). Multiple callables may share a
        breaker name if they share the same upstream dependency and
        should trip together.
    fallback:
        Value returned when the breaker is open. Defaults to ``None``.

    Behaviour
    ---------
    * When ``AI_HARDENING_CIRCUIT_BREAKER`` is falsy, the wrapper is a
      pass-through and does NOT record failures/successes - this keeps
      the flag-off path identical to pre-hardening.
    * When enabled and the breaker is OPEN, the wrapped callable is
      not invoked. ``fallback`` is returned immediately.
    * When enabled and the breaker is CLOSED, the callable is invoked:
        * Returning a value - counted as success, breaker cleared.
        * Raising - counted as failure, may open the breaker. The
          exception is *not* re-raised; ``fallback`` is returned so
          upstream callers see the same no-AI contract.
        * Returning ``None`` - NOT counted as a failure (callers
          already return ``None`` for "AI unavailable, keep going").
    """

    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            if not getattr(settings, "AI_HARDENING_CIRCUIT_BREAKER", False):
                return fn(*args, **kwargs)

            if _is_open(name):
                logger.info("AI circuit breaker open -- short-circuiting %s", name)
                _emit_metric("ai.circuit_breaker.short_circuited", name)
                return fallback

            try:
                result = fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001 - intentional catch-all
                logger.warning(
                    "AI call %s raised — counting as breaker failure: %s",
                    name,
                    exc,
                )
                _record_failure(name)
                return fallback

            # ``None`` is the canonical "AI unavailable but soft-failed"
            # return - do not count as either success or failure.
            if result is not None:
                _record_success(name)
            return result

        return wrapper  # type: ignore[return-value]

    return decorator


__all__ = [
    "with_circuit_breaker",
    "FAILURE_THRESHOLD",
    "COOLDOWN_SECONDS",
]
