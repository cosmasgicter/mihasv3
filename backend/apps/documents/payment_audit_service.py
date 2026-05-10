"""Payment audit service — centralized audit-row shape and PII redaction.

Every payment audit event (initiation, transition, risk flag, admin override,
super-admin correction, webhook processing, dev-bypass usage, rate-limit
hits, receipt generation) flows through :class:`PaymentAuditService` so that
redaction rules live in exactly one place.

Key responsibilities:

1.  ``_redact_pii(metadata)`` walks the caller-supplied metadata recursively
    and replaces keys matching common PII markers with hash-only
    representations, and strips document-body style fields entirely.
2.  ``record_payment_event(...)`` writes a row to the ``audit_logs`` table
    with ``entity_type='payment'`` so the existing partial index
    ``idx_audit_logs_payment_entity_created_at`` is hit for reads.
3.  Action prefixes listed in ``SECURITY_RETENTION_ACTION_PREFIXES`` are
    automatically promoted to ``retention_category='security'`` (365-day
    retention). Everything else defaults to ``standard`` (90-day).
4.  Audit-writer failures never propagate: a transient ``audit_logs`` issue
    must not abort a money-state transition. Exceptions are logged at
    ``WARNING`` level and captured by the Sentry/GlitchTip logging
    integration.

Requirements: R17.1, R17.4, R22.4, R22.5.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Optional
from uuid import UUID

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Retention promotion rules
# ---------------------------------------------------------------------------

#: Action prefixes that are automatically retained for 365 days. Every other
#: action defaults to the 90-day ``standard`` retention window. The tuple is
#: kept in sync with ``payment_service._SECURITY_RETENTION_ACTION_PREFIXES``
#: (design: "Audit actions → retention" table).
SECURITY_RETENTION_ACTION_PREFIXES: tuple[str, ...] = (
    "payment.force_approved",
    "payment.super_admin_corrected",
    "payment.dev_bypass_used",
    "payment.rate_limited",
)


# ---------------------------------------------------------------------------
# PII redaction markers
# ---------------------------------------------------------------------------

#: Keys (case-insensitive substring match) whose values are replaced with
#: ``{"phone_hash": sha256(value)[:16], "phone_last4": value[-4:]}``.
_PHONE_KEY_MARKERS: tuple[str, ...] = ("phone", "msisdn", "mobile")

#: Keys (case-insensitive substring match) whose values are replaced with
#: ``sha256(str(value))[:16]`` (lowercase hex digest, first 16 chars).
_HASH_KEY_MARKERS: tuple[str, ...] = (
    "nrc",
    "passport",
    "pan",
    "cvv",
    "card_number",
)

#: Keys stripped from the payload entirely — never persisted or logged.
_STRIP_KEYS: frozenset[str] = frozenset(
    {"document_body", "file_content", "raw_payload"}
)


def _sha256_hex(value: str) -> str:
    """Full SHA-256 hex digest of ``value`` (UTF-8 encoded)."""
    return hashlib.sha256((value or "").encode("utf-8")).hexdigest()


def _sha256_hex_short(value: str) -> str:
    """First 16 chars of :func:`_sha256_hex` — deterministic fingerprint."""
    return _sha256_hex(value)[:16]


def _key_matches(key: str, markers: tuple[str, ...]) -> bool:
    """Case-insensitive substring match of ``key`` against ``markers``."""
    lowered = key.lower()
    return any(marker in lowered for marker in markers)


def _redact_phone(value: Any) -> dict[str, str]:
    """Render a phone value as ``{phone_hash, phone_last4}``.

    Non-string values are coerced via ``str(...)`` so dicts, ints, and
    lists in phone fields are still redacted rather than leaked verbatim.
    """
    s = "" if value is None else str(value)
    last4 = s[-4:] if len(s) >= 4 else s
    return {
        "phone_hash": _sha256_hex_short(s),
        "phone_last4": last4,
    }


class PaymentAuditService:
    """Thin wrapper over the existing ``audit_logs`` table.

    The class is a namespace — every method is a ``@staticmethod`` so callers
    do not need to instantiate it. See module docstring for responsibilities.
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @staticmethod
    def record_payment_event(
        *,
        action: str,
        payment_id: Optional[UUID],
        application_id: Optional[UUID] = None,
        actor_id: Optional[UUID] = None,
        actor_role: Optional[str] = None,
        metadata: Optional[dict] = None,
        retention_category: str = "standard",
        request: Optional[Any] = None,
    ) -> None:
        """Persist one payment audit row.

        Args:
            action: Audit action string, e.g. ``"payment.initiated"``.
            payment_id: The ``payments.id`` the event is about. Stored as
                ``entity_id``.
            application_id: Included in ``changes`` metadata for
                cross-reference reads. Never used to populate ``entity_id``.
            actor_id: Acting user (``None`` for system-driven events).
            actor_role: Acting role (e.g. ``"admin"``, ``"super_admin"``).
                Copied into ``metadata['actor_role']`` when supplied.
            metadata: Free-form event payload; recursively redacted before
                persistence.
            retention_category: ``"standard"`` (90 days) or ``"security"``
                (365 days). Automatically promoted to ``"security"`` for any
                action prefix in
                :data:`SECURITY_RETENTION_ACTION_PREFIXES`.
            request: Optional Django ``HttpRequest``; the client IP is
                hashed into ``ip_address`` and the user-agent string into
                ``user_agent`` (both SHA-256 hex). The ``*_encrypted``
                columns are reserved for future use and left empty.

        Never raises. Audit-writer failures are captured at WARNING level
        and forwarded to the logging pipeline (GlitchTip via ``sentry-sdk``).
        """
        # Local import keeps this module importable before the ``common``
        # app is ready (avoids circular-import risk at module load time).
        try:
            from apps.common.models import AuditLog  # type: ignore[import-not-found]
        except Exception:
            logger.warning(
                "PaymentAuditService could not import AuditLog; "
                "skipping audit event %s", action, exc_info=True,
            )
            return

        meta: dict[str, Any] = dict(metadata or {})
        if actor_role:
            meta.setdefault("actor_role", actor_role)
        if application_id is not None and "application_id" not in meta:
            meta["application_id"] = str(application_id)

        redacted = PaymentAuditService._redact_pii(meta)

        effective_retention = retention_category
        if action.startswith(SECURITY_RETENTION_ACTION_PREFIXES):
            effective_retention = "security"

        ip_hash, ua_hash = PaymentAuditService._hash_request_network(request)

        try:
            AuditLog.objects.create(
                entity_type="payment",
                entity_id=payment_id,
                action=action,
                actor_id=actor_id,
                changes=redacted,
                ip_address=ip_hash,
                user_agent=ua_hash,
                retention_category=effective_retention,
            )
        except Exception:
            # Never raise from the audit writer — a financial transition
            # must not be rolled back because of a transient audit issue.
            logger.warning(
                "Failed to emit payment audit event %s for payment %s",
                action,
                payment_id,
                exc_info=True,
            )

    # ------------------------------------------------------------------
    # Internal helpers — exposed for unit + property tests
    # ------------------------------------------------------------------

    @staticmethod
    def _redact_pii(value: Any) -> Any:
        """Recursively redact PII markers.

        Rules (case-insensitive key match, substring):

        * Keys containing ``phone``, ``msisdn``, ``mobile`` → replaced with
          ``{"phone_hash": sha256(str(value))[:16], "phone_last4":
          str(value)[-4:]}``.
        * Keys containing ``nrc``, ``passport``, ``pan``, ``cvv``,
          ``card_number`` → replaced with ``sha256(str(value))[:16]``
          (lowercase hex, 16 chars).
        * Keys exactly named ``document_body``, ``file_content``,
          ``raw_payload`` → stripped from the output.
        * All other keys are preserved; dict and list values are walked
          recursively so nested PII is redacted at any depth.
        """
        if isinstance(value, dict):
            result: dict[Any, Any] = {}
            for key, sub_value in value.items():
                if isinstance(key, str):
                    if key in _STRIP_KEYS:
                        continue
                    if _key_matches(key, _PHONE_KEY_MARKERS):
                        result[key] = _redact_phone(sub_value)
                        continue
                    if _key_matches(key, _HASH_KEY_MARKERS):
                        result[key] = _sha256_hex_short(
                            "" if sub_value is None else str(sub_value)
                        )
                        continue
                # Non-PII key (or non-string key) — recurse into the value.
                result[key] = PaymentAuditService._redact_pii(sub_value)
            return result

        if isinstance(value, list):
            return [PaymentAuditService._redact_pii(item) for item in value]

        if isinstance(value, tuple):
            return tuple(
                PaymentAuditService._redact_pii(item) for item in value
            )

        return value

    @staticmethod
    def _hash_request_network(
        request: Optional[Any],
    ) -> tuple[Optional[str], Optional[str]]:
        """Return ``(ip_hash, ua_hash)`` for ``request`` or ``(None, None)``.

        Both values are full SHA-256 hex digests. The ``*_encrypted``
        columns on ``audit_logs`` are intentionally left empty; they are
        reserved for future forensic-restricted reads and are not used by
        the payment audit path today.
        """
        if request is None:
            return None, None

        try:
            # Prefer the shared helper which respects ``X-Forwarded-For``.
            from apps.common.audit_network import extract_client_ip
        except Exception:  # pragma: no cover — defensive fallback
            extract_client_ip = None  # type: ignore[assignment]

        try:
            if extract_client_ip is not None:
                ip = extract_client_ip(request) or ""
            else:
                meta = getattr(request, "META", {}) or {}
                ip = meta.get("REMOTE_ADDR", "") or ""
            meta = getattr(request, "META", {}) or {}
            ua = meta.get("HTTP_USER_AGENT", "") or ""
        except Exception:
            logger.warning(
                "Failed to extract request network context for payment audit",
                exc_info=True,
            )
            return None, None

        ip_hash = _sha256_hex(ip) if ip else None
        ua_hash = _sha256_hex(ua) if ua else None
        return ip_hash, ua_hash


__all__ = [
    "PaymentAuditService",
    "SECURITY_RETENTION_ACTION_PREFIXES",
]
