"""Webhook event validation and processing for Lenco payment webhooks.

Validates HMAC-SHA512 signatures, logs every incoming event to
``webhook_event_logs``, and delegates payment status updates to
``PaymentService``.

Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from dataclasses import asdict, dataclass

from django.conf import settings
from django.utils import timezone

from apps.documents.models import WebhookEventLog
from apps.documents.payment_service import PaymentService

logger = logging.getLogger(__name__)

# Event types that the processor knows how to handle.
_KNOWN_EVENT_TYPES = frozenset({
    'collection.successful',
    'collection.failed',
    'collection.settled',
})


# ---------------------------------------------------------------------------
# Canonical JSON + WebhookEventIdentity (payment-hardening Task 21.1–21.2)
# ---------------------------------------------------------------------------


def canonical_json(payload: dict) -> bytes:
    """Deterministically serialize a webhook payload to canonical bytes.

    Used as the hash input for ``WebhookEventIdentity.payload_hash`` so that
    two logically-equivalent payloads always produce the same digest.

    Raises ``TypeError`` / ``ValueError`` on un-serialisable inputs; callers
    MUST short-circuit the webhook (log ``processing_error='Canonical
    serialization failed'`` and skip the Payment mutation - R21.5).
    """
    try:
        return json.dumps(
            payload,
            sort_keys=True,
            separators=(',', ':'),
            default=str,
            ensure_ascii=False,
        ).encode('utf-8')
    except (TypeError, ValueError, UnicodeEncodeError) as exc:
        logger.warning(
            "canonical_json failed: err=%s payload_type=%s",
            exc,
            type(payload).__name__,
        )
        raise


@dataclass(frozen=True)
class WebhookEventIdentity:
    """Canonical identity for a Lenco webhook event (Task 21.2).

    Four fields deterministically identify a webhook event:
    - ``provider_event_id``: Lenco's ``data.id``/``eventId``/``event_id``
      (empty when none is present).
    - ``event_type``: e.g. ``collection.successful``.
    - ``reference``: the payment transaction reference.
    - ``payload_hash``: SHA-256 hex digest over ``canonical_json(payload)``.

    The log-safe ``print()`` form is ``wh:{pid}|{type}|{ref}|{hash[:12]}``
    so hash prefixes appear in logs without leaking the raw payload (R21.3).
    """

    provider_event_id: str
    event_type: str
    reference: str
    payload_hash: str

    def print(self) -> str:  # noqa: A003 - name mandated by the spec
        """Log-safe pretty-print - truncated hash, no payload leakage."""
        return (
            f"wh:{self.provider_event_id}|{self.event_type}"
            f"|{self.reference}|{self.payload_hash[:12]}"
        )

    @staticmethod
    def parse(s: str) -> 'WebhookEventIdentity':
        """Inverse of :meth:`print`.

        Requires the ``wh:`` prefix; splits on ``|``. Note that because
        ``print()`` truncates ``payload_hash`` to its first 12 chars,
        the parsed ``payload_hash`` reflects that same prefix.
        """
        if not isinstance(s, str) or not s.startswith('wh:'):
            raise ValueError("WebhookEventIdentity.parse: missing 'wh:' prefix")
        body = s[len('wh:'):]
        parts = body.split('|')
        if len(parts) != 4:
            raise ValueError(
                "WebhookEventIdentity.parse: expected 4 '|'-separated parts"
            )
        provider_event_id, event_type, reference, payload_hash = parts
        return WebhookEventIdentity(
            provider_event_id=provider_event_id,
            event_type=event_type,
            reference=reference,
            payload_hash=payload_hash,
        )

    def to_dict(self) -> dict:
        """Return all four fields as a plain dict (JSON-serialisable)."""
        return asdict(self)


class WebhookProcessor:
    """Validates and processes Lenco webhook events."""

    def __init__(self) -> None:
        self._payment_service = PaymentService()

    # ------------------------------------------------------------------
    # Signature validation
    # ------------------------------------------------------------------

    def validate_signature(self, raw_body: bytes, signature: str) -> bool:
        """Verify the ``X-Lenco-Signature`` header value.

        Algorithm (from Lenco docs):
            webhook_hash_key = SHA-256(LENCO_API_SECRET_KEY)
            expected         = HMAC-SHA512(raw_body, webhook_hash_key)
            valid            = constant_time_compare(expected, signature)
        """
        api_secret: str = getattr(settings, 'LENCO_API_SECRET_KEY', '') or ''
        if not api_secret:
            logger.warning("LENCO_API_SECRET_KEY not configured -- cannot validate webhook signature")
            return False

        hash_key = hashlib.sha256(api_secret.encode('utf-8')).hexdigest()
        expected = hmac.new(hash_key.encode('utf-8'), raw_body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, signature)

    # ------------------------------------------------------------------
    # Strict identity + dedup primitives (payment-hardening Task 21.3–21.4)
    # ------------------------------------------------------------------

    def compute_identity(
        self, event_type: str, payload: dict
    ) -> WebhookEventIdentity:
        """Compute the canonical :class:`WebhookEventIdentity` for a payload.

        Extracts the provider event id from ``payload.data.id`` /
        ``eventId`` / ``event_id`` (falling back to empty string), the
        payment reference from ``payload.data.reference``, and hashes the
        canonical JSON encoding of the full payload (R8.3, R8.4).

        May propagate ``TypeError`` / ``ValueError`` from
        :func:`canonical_json` - callers should treat that as
        ``processing_error='Canonical serialization failed'`` (R21.5).
        """
        data = payload.get('data', {}) if isinstance(payload, dict) else {}
        if not isinstance(data, dict):
            data = {}

        provider_event_id = str(
            data.get('id')
            or data.get('eventId')
            or data.get('event_id')
            or ''
        )
        reference = str(data.get('reference') or '')
        payload_hash = hashlib.sha256(canonical_json(payload)).hexdigest()

        return WebhookEventIdentity(
            provider_event_id=provider_event_id,
            event_type=event_type,
            reference=reference,
            payload_hash=payload_hash,
        )

    def is_duplicate(self, identity: WebhookEventIdentity) -> bool:
        """Return ``True`` when an equivalent processed event already exists.

        Two strategies (R8.5, R8.6):

        1. If ``identity.provider_event_id`` is non-empty, look for any prior
           processed ``WebhookEventLog`` whose stashed ``_webhook_identity``
           JSON field carries the same provider id.
        2. Otherwise fall back to ``(reference, event_type)`` with
           ``SELECT FOR UPDATE`` to serialise concurrent deliveries.
        """
        from django.db import transaction

        with transaction.atomic():
            if identity.provider_event_id:
                return (
                    WebhookEventLog.objects.filter(
                        payload___webhook_identity__provider_event_id=identity.provider_event_id,
                        processed=True,
                    )
                    .exists()
                )
            return (
                WebhookEventLog.objects.select_for_update()
                .filter(
                    reference=identity.reference,
                    event_type=identity.event_type,
                    processed=True,
                )
                .exists()
            )

    # ------------------------------------------------------------------
    # Event processing
    # ------------------------------------------------------------------

    def process(self, event_type: str, payload: dict, *, signature_valid: bool = True) -> None:
        """Log the webhook event and delegate to :class:`PaymentService`.

        A ``WebhookEventLog`` record is **always** created - even when the
        signature was invalid (the caller passes ``signature_valid=False``).

        When ``settings.PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT`` is enabled,
        the strict identity/dedup path (Task 21.5) runs:
        :meth:`compute_identity` → :meth:`is_duplicate` → delegation to
        :meth:`PaymentService.apply_webhook_event`. Otherwise the legacy
        behaviour is preserved unchanged.
        """
        if bool(getattr(settings, 'PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT', False)):
            self._process_strict(event_type, payload, signature_valid=signature_valid)
            return

        self._process_legacy(event_type, payload, signature_valid=signature_valid)

    # ------------------------------------------------------------------
    # Legacy processing path (flag OFF - behaviour preserved)
    # ------------------------------------------------------------------

    def _process_legacy(
        self, event_type: str, payload: dict, *, signature_valid: bool
    ) -> None:
        from django.db import transaction

        reference = self._extract_reference(payload)

        payload_hash = self._payload_hash(payload)
        event_identity = self._event_identity(event_type, reference, payload, payload_hash)

        if reference and signature_valid:
            with transaction.atomic():
                duplicate = (
                    WebhookEventLog.objects.select_for_update()
                    .filter(reference=reference, event_type=event_type, processed=True)
                    .first()
                )
                if duplicate:
                    duplicate_payload = dict(payload)
                    duplicate_payload["_webhook_identity"] = event_identity
                    WebhookEventLog.objects.create(
                        event_type=event_type,
                        reference=reference,
                        payload=duplicate_payload,
                        signature_valid=signature_valid,
                        processed=False,
                        processing_error='Duplicate event already processed',
                        created_at=timezone.now(),
                    )
                    logger.info("Duplicate webhook skipped: ref=%s event=%s", reference, event_type)
                    return

        payload_to_store = dict(payload)
        payload_to_store["_webhook_identity"] = event_identity
        log_entry = WebhookEventLog.objects.create(
            event_type=event_type,
            reference=reference,
            payload=payload_to_store,
            signature_valid=signature_valid,
            processed=False,
            processing_error=None,
            created_at=timezone.now(),
        )

        if not signature_valid:
            log_entry.processing_error = 'Invalid webhook signature'
            log_entry.save(update_fields=['processing_error'])
            logger.warning(
                "Webhook event logged with invalid signature: id=%s event=%s",
                log_entry.id,
                event_type,
            )
            return

        if event_type not in _KNOWN_EVENT_TYPES:
            log_entry.processed = True
            log_entry.processing_error = f'Unrecognised event type: {event_type}'
            log_entry.save(update_fields=['processed', 'processing_error'])
            logger.info("Ignoring unrecognised webhook event_type=%s", event_type)
            return

        if not reference:
            log_entry.processing_error = 'Missing reference in payload'
            log_entry.save(update_fields=['processing_error'])
            logger.warning("Webhook payload missing reference: id=%s", log_entry.id)
            return

        try:
            self._payment_service.process_webhook_event(
                event_type=event_type,
                reference=reference,
                payload=payload,
            )
            log_entry.processed = True
            log_entry.save(update_fields=['processed'])
        except Exception:
            error_msg = 'Error processing webhook event'
            logger.exception("%s: id=%s", error_msg, log_entry.id)
            log_entry.processing_error = error_msg
            log_entry.save(update_fields=['processing_error'])

    # ------------------------------------------------------------------
    # Strict processing path (flag ON - Task 21.5)
    # ------------------------------------------------------------------

    def _process_strict(
        self, event_type: str, payload: dict, *, signature_valid: bool
    ) -> None:
        """Strict-dedup variant of :meth:`process` (R8.1–R8.7, R21.1–R21.5).

        - Canonical-JSON failures log ``processing_error='Canonical
          serialization failed'``, persist the log row, and skip any
          Payment mutation (R21.5).
        - On valid signature + known event, delegates to
          :meth:`PaymentService.apply_webhook_event`.
        - Duplicate processed events short-circuit without mutating Payment.
        - Unknown event types log ``processing_error='Unrecognised event type'``
          and mark the row as processed (R8.7).
        """
        # 1. Try canonical identity first so we can stash it alongside the
        #    payload in every persisted log row.
        try:
            identity = self.compute_identity(event_type, payload)
        except (TypeError, ValueError, UnicodeEncodeError):
            # R21.5: un-serialisable payload - write the audit row and bail
            # without mutating any Payment.
            safe_payload = payload if isinstance(payload, dict) else {'_raw': str(payload)}
            WebhookEventLog.objects.create(
                event_type=event_type,
                reference=self._extract_reference(safe_payload),
                payload={'_canonical_error': True},
                signature_valid=signature_valid,
                processed=False,
                processing_error='Canonical serialization failed',
                created_at=timezone.now(),
            )
            logger.warning(
                "Webhook dropped: canonical serialization failed event=%s",
                event_type,
            )
            return

        reference = identity.reference
        payload_to_store = dict(payload) if isinstance(payload, dict) else {'_raw': str(payload)}
        payload_to_store['_webhook_identity'] = identity.to_dict()

        # 2. Invalid signature → log + return (never mutate a Payment).
        if not signature_valid:
            WebhookEventLog.objects.create(
                event_type=event_type,
                reference=reference,
                payload=payload_to_store,
                signature_valid=False,
                processed=False,
                processing_error='Invalid webhook signature',
                created_at=timezone.now(),
            )
            logger.warning(
                "Webhook event logged with invalid signature: event=%s identity=%s",
                event_type,
                identity.print(),
            )
            return

        # 3. Unknown event type → log as processed, skip Payment mutation.
        if event_type not in _KNOWN_EVENT_TYPES:
            WebhookEventLog.objects.create(
                event_type=event_type,
                reference=reference,
                payload=payload_to_store,
                signature_valid=True,
                processed=True,
                processing_error='Unrecognised event type',
                created_at=timezone.now(),
            )
            logger.info(
                "Ignoring unrecognised webhook event_type=%s identity=%s",
                event_type,
                identity.print(),
            )
            return

        # 4. Dedup check - strict identity-based.
        if self.is_duplicate(identity):
            WebhookEventLog.objects.create(
                event_type=event_type,
                reference=reference,
                payload=payload_to_store,
                signature_valid=True,
                processed=False,
                processing_error='Duplicate event already processed',
                created_at=timezone.now(),
            )
            logger.info(
                "Duplicate webhook skipped: identity=%s", identity.print()
            )
            return

        # 5. Write the log row then delegate to apply_webhook_event.
        log_entry = WebhookEventLog.objects.create(
            event_type=event_type,
            reference=reference,
            payload=payload_to_store,
            signature_valid=True,
            processed=False,
            processing_error=None,
            created_at=timezone.now(),
        )

        if not reference:
            log_entry.processing_error = 'Missing reference in payload'
            log_entry.save(update_fields=['processing_error'])
            logger.warning(
                "Webhook payload missing reference: id=%s identity=%s",
                log_entry.id,
                identity.print(),
            )
            return

        try:
            self._payment_service.apply_webhook_event(
                event_type=event_type,
                reference=reference,
                payload=payload,
            )
            log_entry.processed = True
            log_entry.save(update_fields=['processed'])
        except Exception:
            error_msg = 'Error processing webhook event'
            logger.exception(
                "%s: id=%s identity=%s",
                error_msg,
                log_entry.id,
                identity.print(),
            )
            log_entry.processing_error = error_msg
            log_entry.save(update_fields=['processing_error'])

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_reference(payload: dict) -> str:
        """Extract ``reference`` from ``payload.data.reference``."""
        data = payload.get('data', {})
        if isinstance(data, dict):
            return data.get('reference', '') or ''
        return ''

    @staticmethod
    def _payload_hash(payload: dict) -> str:
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _event_identity(event_type: str, reference: str, payload: dict, payload_hash: str) -> dict:
        data = payload.get("data", {})
        provider_event_id = ""
        if isinstance(data, dict):
            provider_event_id = (
                str(data.get("id") or data.get("eventId") or data.get("event_id") or "")
            )
        return {
            "provider_event_id": provider_event_id,
            "event_type": event_type,
            "reference": reference,
            "payload_hash": payload_hash,
        }
