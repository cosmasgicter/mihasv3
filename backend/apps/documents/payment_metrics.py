"""Payment metrics - counter registry with PII label guardrails.

This module is the single authoritative registry of payment counter names
and their allowed label schema, per the payment-hardening design's
"MetricsService" / "Audit Events and Metrics" section.

It exposes two thin wrappers - :func:`increment` and
:func:`observe_latency` - over the GlitchTip-compatible ``sentry_sdk``
metrics API. There is no Prometheus endpoint in this repo; GlitchTip
aggregates counter events emitted via ``sentry_sdk.metrics.incr`` /
``sentry_sdk.metrics.distribution`` where available, and every call is
also mirrored as a structured log record tagged ``type=metric`` for
downstream log-pipeline aggregation.

Design goals:

1. **Fail-safe in the hot path.** Unknown counter names, unknown tag
   keys, or forbidden PII tag keys never raise. They drop the emission
   (counter or tag) and emit a WARNING so the caller is audible in logs
   without taking down a payment transition.
2. **PII guardrail.** Tag keys matching PII markers
   (``user_id``, ``application_id``, ``payment_id``, ``phone``,
   ``msisdn``, ``mobile``, ``nrc``, ``passport``, ``pan``, ``cvv``,
   ``card_number``, ``email``) are silently dropped before any value
   reaches ``sentry_sdk``.
3. **Bounded cardinality.** Tag VALUES for known tag NAMES must come
   from a fixed allow-list (see :data:`ALLOWED_LABEL_VALUES`). Unknown
   values are dropped (not emitted) and warned.
4. **Sentry-optional.** ``sentry_sdk.metrics`` is an optional extension
   that may not be importable in every environment. The delegation is
   guarded with ``getattr(sentry_sdk, 'metrics', None)``.

Requirements: R17.2, R17.3, R17.4, R22.4.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

try:  # pragma: no cover - optional at import time
    import sentry_sdk
except Exception:  # pragma: no cover - environments without sentry_sdk
    sentry_sdk = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Counter registry
# ---------------------------------------------------------------------------

#: Authoritative list of payment counter names. Any ``increment()`` call
#: with a name not in this tuple is dropped (logged as WARNING). The
#: ``test_payment_metrics_registry.py`` smoke test parses the emitter
#: modules and asserts every counter they emit appears here.
PAYMENT_COUNTERS: tuple[str, ...] = (
    # Initiation
    "payment.initiation.success",
    "payment.initiation.duplicate",
    "payment.initiation.failure",
    # Webhook
    "payment.webhook.invalid_signature",
    "payment.webhook.duplicate",
    "payment.webhook.processed",
    # Risk flags
    "payment.risk.amount_mismatch",
    "payment.risk.currency_mismatch",
    "payment.risk.missing_provider_reference",
    "payment.risk.invalid_amount",
    # Provider initiation (mobile money)
    "payment.provider.unknown",
    "payment.provider.accepted",
    "payment.provider.rejected",
    # Admin and receipt
    "payment.admin.override",
    "payment.receipt.generated",
    # State transitions
    "payment.transition.successful",
    "payment.transition.failed",
    "payment.transition.expired",
    "payment.transition.force_approved",
    "payment.transition.blocked",
    # Verify
    "payment.verify.provider_unavailable",
    "payment.verify.confirmed",
    "payment.verify.pending",
    # Reconciliation
    "payment.reconcile.processed",
    "payment.reconcile.expired",
    # Security / governance
    "payment.rate_limited",
    "payment.dev_bypass_used",
)


# ---------------------------------------------------------------------------
# Label schema
# ---------------------------------------------------------------------------

#: Per-tag-name allow-list of acceptable VALUES. Any tag with a name in
#: this dict whose value is not in the corresponding frozenset is
#: dropped (logged as WARNING). Tag names not in this dict are passed
#: through as-is, subject to the PII/forbidden-name guard below.
ALLOWED_LABEL_VALUES: dict[str, frozenset[str]] = {
    "endpoint": frozenset(
        {
            "initiate",
            "mobile_money",
            "verify",
            "webhook",
            "resolve_fee",
            "admin_review",
            "super_admin_correct",
            "correct",
            "risk_flags",
        }
    ),
    "user_role": frozenset(
        {
            "student",
            "admin",
            "super_admin",
            "reviewer",
            "anonymous",
        }
    ),
    "risk_type": frozenset(
        {
            "amount_mismatch",
            "currency_mismatch",
            "invalid_amount",
            "missing_provider_reference",
        }
    ),
    "source": frozenset(
        {
            "initiate",
            "verify",
            "webhook",
            "admin_override",
            "reconciliation",
            "super_admin_correction",
        }
    ),
    "provider_status": frozenset(
        {
            "accepted",
            "rejected",
            "unknown",
            "not_started",
            "sent",
        }
    ),
    "outcome": frozenset(
        {
            "success",
            "failure",
            "duplicate",
            "expired",
            "unknown",
            "super_admin_corrected",
        }
    ),
}


#: Tag NAMES that are banned from metric labels because they are PII or
#: unbounded-cardinality identifiers. If any of these appears as a key
#: in the ``tags`` dict, it is dropped and a WARNING is logged before
#: anything reaches ``sentry_sdk``.
_FORBIDDEN_LABEL_NAMES: frozenset[str] = frozenset(
    {
        "user_id",
        "application_id",
        "payment_id",
        "phone",
        "msisdn",
        "mobile",
        "nrc",
        "passport",
        "pan",
        "cvv",
        "card_number",
        "email",
    }
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _sanitize_tags(
    counter_or_histogram: str,
    tags: Optional[dict[str, Any]],
) -> dict[str, str]:
    """Return a copy of ``tags`` with PII keys and disallowed values removed.

    - Drops any key in :data:`_FORBIDDEN_LABEL_NAMES` (PII / high cardinality).
    - For keys present in :data:`ALLOWED_LABEL_VALUES`, drops entries whose
      value is not in the allow-list.
    - Coerces remaining values to ``str`` - GlitchTip/Sentry tag values
      are always string-typed.
    - Logs a WARNING for every dropped key/value so the caller is
      audible in logs without raising in the payment hot path.
    """
    if not tags:
        return {}

    sanitized: dict[str, str] = {}
    for raw_key, raw_value in tags.items():
        key = str(raw_key)

        if key in _FORBIDDEN_LABEL_NAMES:
            logger.warning(
                "payment_metrics: dropped forbidden PII tag key",
                extra={
                    "metric": counter_or_histogram,
                    "tag_key": key,
                },
            )
            continue

        allowed = ALLOWED_LABEL_VALUES.get(key)
        if allowed is not None:
            value_str = str(raw_value)
            if value_str not in allowed:
                logger.warning(
                    "payment_metrics: dropped tag with disallowed value",
                    extra={
                        "metric": counter_or_histogram,
                        "tag_key": key,
                        "tag_value": value_str,
                    },
                )
                continue
            sanitized[key] = value_str
        else:
            # Unknown tag name - passed through as a string. The smoke
            # test / code review is the backstop here; we do not
            # silently reject unseen keys (the design is additive).
            sanitized[key] = str(raw_value)

    return sanitized


def _sentry_metrics():
    """Return the ``sentry_sdk.metrics`` module if available, else ``None``.

    The ``metrics`` submodule is an optional extension of ``sentry_sdk``
    and is not guaranteed to exist in every deployed environment.
    Importing ``apps.documents.payment_metrics`` must never fail on
    environments without it.
    """
    if sentry_sdk is None:
        return None
    return getattr(sentry_sdk, "metrics", None)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def increment(
    counter: str,
    *,
    amount: int = 1,
    tags: Optional[dict[str, Any]] = None,
) -> None:
    """Increment the named payment counter.

    Fail-safe behaviour (never raises):

    * Unknown counter name -> WARNING, no emission.
    * PII tag keys (``user_id``, ``phone``, ``nrc``, ...) -> dropped.
    * Known tag names with disallowed values -> dropped.
    * Remaining tags are forwarded to ``sentry_sdk.metrics.incr`` when
      that module is available, and always mirrored as a structured
      INFO log record tagged ``type=metric``.
    """
    if counter not in PAYMENT_COUNTERS:
        logger.warning(
            "payment_metrics: dropped unknown counter",
            extra={"metric": counter, "amount": amount},
        )
        return

    safe_tags = _sanitize_tags(counter, tags)

    metrics_mod = _sentry_metrics()
    if metrics_mod is not None and hasattr(metrics_mod, "incr"):
        try:
            metrics_mod.incr(counter, amount, tags=safe_tags)
        except Exception:  # pragma: no cover - defensive
            logger.warning(
                "payment_metrics: sentry_sdk.metrics.incr failed",
                extra={"metric": counter},
            )

    logger.info(
        "payment_metric",
        extra={
            "type": "metric",
            "metric": counter,
            "amount": amount,
            "tags": safe_tags,
        },
    )


def observe_latency(
    histogram: str,
    *,
    value_ms: float,
    tags: Optional[dict[str, Any]] = None,
) -> None:
    """Record a latency observation (in milliseconds) against ``histogram``.

    Applies the same tag validation as :func:`increment`. Delegates to
    ``sentry_sdk.metrics.distribution`` with ``unit="millisecond"`` when
    the metrics module is available, and always mirrors a structured log
    line.

    Note: histogram names are not constrained against
    :data:`PAYMENT_COUNTERS`; they are a separate namespace. The smoke
    test intentionally covers only counters.
    """
    safe_tags = _sanitize_tags(histogram, tags)

    metrics_mod = _sentry_metrics()
    if metrics_mod is not None and hasattr(metrics_mod, "distribution"):
        try:
            metrics_mod.distribution(
                histogram,
                value_ms,
                unit="millisecond",
                tags=safe_tags,
            )
        except Exception:  # pragma: no cover - defensive
            logger.warning(
                "payment_metrics: sentry_sdk.metrics.distribution failed",
                extra={"metric": histogram},
            )

    logger.info(
        "payment_metric",
        extra={
            "type": "metric",
            "metric": histogram,
            "value_ms": value_ms,
            "tags": safe_tags,
        },
    )


__all__ = [
    "PAYMENT_COUNTERS",
    "ALLOWED_LABEL_VALUES",
    "increment",
    "observe_latency",
]
