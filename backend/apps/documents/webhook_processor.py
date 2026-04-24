"""Webhook event validation and processing for Lenco payment webhooks.

Validates HMAC-SHA512 signatures, logs every incoming event to
``webhook_event_logs``, and delegates payment status updates to
``PaymentService``.

Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
"""

from __future__ import annotations

import hashlib
import hmac
import logging

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
            logger.warning("LENCO_API_SECRET_KEY not configured — cannot validate webhook signature")
            return False

        hash_key = hashlib.sha256(api_secret.encode('utf-8')).hexdigest()
        expected = hmac.new(hash_key.encode('utf-8'), raw_body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, signature)

    # ------------------------------------------------------------------
    # Event processing
    # ------------------------------------------------------------------

    def process(self, event_type: str, payload: dict, *, signature_valid: bool = True) -> None:
        """Log the webhook event and delegate to :class:`PaymentService`.

        A ``WebhookEventLog`` record is **always** created — even when the
        signature was invalid (the caller passes ``signature_valid=False``).
        """
        from django.db import transaction

        reference = self._extract_reference(payload)

        # Atomic dedup check: use get_or_create inside a transaction to prevent
        # concurrent duplicate processing.
        if reference and signature_valid:
            with transaction.atomic():
                _, created = WebhookEventLog.objects.select_for_update().get_or_create(
                    reference=reference,
                    event_type=event_type,
                    processed=True,
                    defaults={
                        'payload': payload,
                        'signature_valid': signature_valid,
                        'processing_error': None,
                        'created_at': timezone.now(),
                    },
                )
                if not created:
                    WebhookEventLog.objects.create(
                        event_type=event_type,
                        reference=reference,
                        payload=payload,
                        signature_valid=signature_valid,
                        processed=True,
                        processing_error='Duplicate event \u2014 already processed',
                        created_at=timezone.now(),
                    )
                    logger.info("Duplicate webhook skipped: ref=%s event=%s", reference, event_type)
                    return

        log_entry = WebhookEventLog.objects.create(
            event_type=event_type,
            reference=reference,
            payload=payload,
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
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_reference(payload: dict) -> str:
        """Extract ``reference`` from ``payload.data.reference``."""
        data = payload.get('data', {})
        if isinstance(data, dict):
            return data.get('reference', '') or ''
        return ''
