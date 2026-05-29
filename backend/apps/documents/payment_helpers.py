"""Payment service module-level helper functions - extracted from payment_service.py.

Stream 9 Phase 2 of the canonical-truth program. Pure helpers used by the
``PaymentService`` class and by other modules (validators, tasks, tests).
Keeping them here lets callers import without instantiating the full service.

The ``payment_service.py`` module continues to re-export every symbol here
for backward compatibility with existing imports.
"""

from __future__ import annotations

import base64
import secrets
import time
from decimal import Decimal


# ---------------------------------------------------------------------------
# Reference & receipt generators
# ---------------------------------------------------------------------------


def _generate_reference(application_number: str) -> str:
    """Build a unique payment reference.

    Format: ``MIHAS-{application_number}-{unix_timestamp_ms}``
    Example: ``MIHAS-APP-2025-0001-1719849600000``
    """
    ts_ms = int(time.time() * 1000)
    return f"MIHAS-{application_number}-{ts_ms}"


def _generate_receipt_number() -> str:
    """Allocate a 12-character base32 receipt identifier.

    Uses ``secrets.token_bytes(8)`` (64 bits) as entropy source, then
    base32-encodes and trims to 12 characters (~60 bits). The output
    character set is ``[A-Z2-7]`` (standard base32 alphabet, padding
    stripped) so receipts are safe to print, read aloud, and embed in
    URLs without additional encoding.

    Uniqueness is enforced downstream by ``uq_payments_receipt_number``.
    """
    raw = secrets.token_bytes(8)
    return base64.b32encode(raw).decode("ascii").rstrip("=")[:12]


def _parse_amount(value) -> Decimal | None:
    """Safely coerce a Lenco amount value to ``Decimal``."""
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# MSISDN helpers - shared between mobile-money initiation and validators
# ---------------------------------------------------------------------------

# Two-digit MSISDN prefixes (after +260) for each operator, per the ZICTA
# national numbering plan: 96/76 = MTN, 97/77 = Airtel, 95/75 = Zamtel.
# These are the corrected defaults; ops can override them via the
# LENCO_*_PREFIXES env vars (read in _operator_for_msisdn) without a redeploy
# if Lenco's operator routing ever diverges from the public plan.
_AIRTEL_PREFIXES: frozenset[str] = frozenset({"97", "77"})
_MTN_PREFIXES: frozenset[str] = frozenset({"96", "76"})
_ZAMTEL_PREFIXES: frozenset[str] = frozenset({"95", "75"})


def _normalize_phone_e164(phone_raw: str) -> str:
    """Normalise a Zambian MSISDN to E.164 (``+260XXXXXXXXX``).

    Accepts these shapes, with whitespace / dashes stripped:

    - ``+260XXXXXXXXX`` - already E.164, passed through.
    - ``0XXXXXXXXX``    - national trunk prefix stripped, ``+260`` added.
    - ``260XXXXXXXXX``  - country code without ``+``, ``+`` prepended.
    - ``XXXXXXXXX``     - 9-digit bare subscriber number, ``+260`` prepended.

    Anything else raises ``ValueError("INVALID_PHONE_FORMAT")``.
    """
    if phone_raw is None:
        raise ValueError("INVALID_PHONE_FORMAT")

    cleaned = phone_raw.strip()
    for ch in (" ", "-", "(", ")", "\t"):
        cleaned = cleaned.replace(ch, "")

    if not cleaned:
        raise ValueError("INVALID_PHONE_FORMAT")

    digits = cleaned[1:] if cleaned.startswith("+") else cleaned

    if not digits.isdigit():
        raise ValueError("INVALID_PHONE_FORMAT")

    # +260XXXXXXXXX → 260 + 9 digits
    if digits.startswith("260") and len(digits) == 12:
        return f"+{digits}"

    # 0XXXXXXXXX → strip trunk, add +260
    if digits.startswith("0") and len(digits) == 10:
        return f"+260{digits[1:]}"

    # Bare 9-digit subscriber number
    if len(digits) == 9:
        return f"+260{digits}"

    raise ValueError("INVALID_PHONE_FORMAT")


def _operator_prefix_overrides() -> tuple[frozenset[str], frozenset[str]]:
    """Read optional env overrides for operator prefix sets.

    ``LENCO_MTN_PREFIXES`` / ``LENCO_AIRTEL_PREFIXES`` are comma-separated
    two-digit prefixes (e.g. ``"96,76"``). When unset, the ZICTA defaults
    apply. Lets ops correct routing without a redeploy.
    """
    from django.conf import settings

    def _parse(raw: str | None, fallback: frozenset[str]) -> frozenset[str]:
        if not raw:
            return fallback
        parts = {p.strip() for p in raw.split(",") if p.strip()}
        return frozenset(parts) or fallback

    mtn = _parse(getattr(settings, "LENCO_MTN_PREFIXES", ""), _MTN_PREFIXES)
    airtel = _parse(getattr(settings, "LENCO_AIRTEL_PREFIXES", ""), _AIRTEL_PREFIXES)
    return mtn, airtel


def _operator_for_msisdn(phone_e164: str) -> str:
    """Derive the operator (``airtel`` / ``mtn``) from an E.164 MSISDN.

    Expects the output shape of ``_normalize_phone_e164`` - i.e. ``+260``
    followed by 9 digits. The two digits immediately after ``+260`` identify
    the operator per the ZICTA numbering plan (96/76 MTN, 97/77 Airtel).

    Raises ``ValueError("PROVIDER_UNAVAILABLE")`` when the prefix is not a
    recognised Airtel or MTN Zambia range (Zamtel mobile money is not
    supported by Lenco, so 95/75 also raise).
    """
    if not phone_e164 or not phone_e164.startswith("+260") or len(phone_e164) != 13:
        raise ValueError("PROVIDER_UNAVAILABLE")
    prefix = phone_e164[4:6]
    mtn_prefixes, airtel_prefixes = _operator_prefix_overrides()
    if prefix in airtel_prefixes:
        return "airtel"
    if prefix in mtn_prefixes:
        return "mtn"
    raise ValueError("PROVIDER_UNAVAILABLE")


# ---------------------------------------------------------------------------
# PII sanitizer for Lenco API responses persisted in payment metadata
# ---------------------------------------------------------------------------

_PII_KEYS_IN_LENCO_RESPONSE = frozenset(k.lower() for k in {
    "phone", "phoneNumber", "phone_number", "msisdn",
    "email", "emailAddress",
    "firstName", "lastName", "fullName", "name",
    "address", "city", "country",
    "nrc", "passport", "identityNumber", "idNumber",
    "dateOfBirth", "dob",
})


def _sanitize_lenco_response(data):
    """Recursively strip PII fields from Lenco API response before persisting."""
    if isinstance(data, dict):
        return {
            k: "[REDACTED]" if k.lower() in _PII_KEYS_IN_LENCO_RESPONSE else _sanitize_lenco_response(v)
            for k, v in data.items()
        }
    if isinstance(data, list):
        return [_sanitize_lenco_response(item) for item in data]
    return data


# ---------------------------------------------------------------------------
# Feature flag helper
# ---------------------------------------------------------------------------

def _forward_only_enabled() -> bool:
    """Return True when the forward-only transition matrix should be enforced."""
    from django.conf import settings
    return bool(getattr(settings, "PAYMENT_HARDENING_FORWARD_ONLY", False))


# ---------------------------------------------------------------------------
# Lenco API call helpers
# ---------------------------------------------------------------------------

def _call_lenco_collection_status(
    reference: str,
    api_secret: str,
    base_url: str,
    timeout: int,
) -> tuple[dict | None, str | None]:
    """Call Lenco ``/collections/status/{reference}`` and return parsed data.

    Returns ``(data_dict, None)`` on success, or ``(None, error_string)``
    on failure. Pure HTTP call - no DB interaction.
    """
    import logging as _logging
    import requests as _http_requests

    _logger = _logging.getLogger(__name__)

    url = f"{base_url.rstrip('/')}/collections/status/{reference}"
    try:
        resp = _http_requests.get(
            url,
            headers={
                "Authorization": f"Bearer {api_secret}",
                "User-Agent": "MIHAS/2.0",
                "Accept": "application/json",
            },
            timeout=timeout,
        )
        resp.raise_for_status()
    except _http_requests.RequestException:
        _logger.info(
            "Lenco API request failed for reference %s", reference, exc_info=True,
        )
        return None, "Unable to reach payment provider. Please try again later."

    try:
        data = resp.json().get("data", {}) or {}
    except (ValueError, AttributeError):
        _logger.error("Lenco API returned non-JSON response for reference %s", reference)
        return None, "Unexpected response from payment provider."

    return data, None


def _classify_mobile_money_response(resp, lenco_data: dict) -> tuple[str, dict, str | None]:
    """Classify a Lenco mobile-money POST response.

    Returns ``(provider_status, provider_data_subset, error_or_none)``.
    Pure function - no DB interaction.
    """
    provider_subset = dict(lenco_data.get("data") or {})
    provider_subset.setdefault("type", "mobile-money")

    if resp.ok:
        return "accepted", provider_subset, None

    if 400 <= resp.status_code < 500:
        error = (
            lenco_data.get("message")
            or lenco_data.get("error")
            or resp.reason
            or "Provider rejected the request."
        )
        return "rejected", provider_subset, str(error)

    # 5xx or other
    error = (
        lenco_data.get("message")
        or lenco_data.get("error")
        or resp.reason
        or "Provider service error."
    )
    return "unknown", provider_subset, f"Provider responded {resp.status_code}: {error}"


def _resolve_fee_for_application(fee_resolver, application, application_id) -> tuple:
    """Resolve program fee and apply waiver for an application.

    Returns ``(resolved_program, resolved_fee, effective_amount)`` or raises
    ``ValueError`` if the program cannot be resolved.

    ``fee_resolver`` is a ``FeeResolver`` instance.
    ``application`` is an Application model instance.
    ``application_id`` is the UUID of the application.
    """
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    from apps.applications.identifier_resolver import IdentifierResolver

    resolved_program = IdentifierResolver.resolve_program(application.program)
    if resolved_program.source == "not_found":
        raise ValueError(
            f"Cannot resolve program '{application.program}'. "
            f"Please verify the program exists and is active."
        )

    resolved = fee_resolver.resolve_fee(
        program_code=resolved_program.code,
        nationality=application.nationality,
        country=getattr(application, 'country', None),
    )

    effective_amount = resolved.amount
    try:
        from apps.documents.fee_waiver_service import FeeWaiverService
        effective_amount = FeeWaiverService.get_effective_fee(
            str(application_id), resolved.amount,
        )
    except Exception:
        _logger.warning(
            "Fee waiver check failed for application %s, using full fee",
            application_id,
            exc_info=True,
        )

    return resolved_program, resolved, effective_amount


def _build_snapshot_dict(
    fee_resolver,
    application,
    application_id,
    resolved_program,
) -> tuple:
    """Resolve fee with snapshot support and build the snapshot dict.

    Returns ``(resolved_fee, effective_amount, snapshot_dict)``.
    Tries ``resolve_for_payment_snapshot`` first, falls back to ``resolve_fee``.
    """
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    resolved = None
    snapshot_dict: dict = {}
    snapshot_builder = getattr(fee_resolver, "resolve_for_payment_snapshot", None)
    if callable(snapshot_builder):
        try:
            resolved, snapshot_obj = snapshot_builder(application)
            snapshot_dict = {
                "expected_amount": str(snapshot_obj.expected_amount),
                "currency": snapshot_obj.currency,
                "residency_category": snapshot_obj.residency_category,
                "program_code": snapshot_obj.program_code,
                "intake_id": snapshot_obj.intake_id,
                "waiver_applied": snapshot_obj.waiver_applied,
                "original_amount": str(snapshot_obj.original_amount),
                "fee_source": snapshot_obj.fee_source,
            }
        except Exception:
            _logger.warning(
                "resolve_for_payment_snapshot failed for application %s — falling back",
                application_id,
                exc_info=True,
            )
            resolved = None

    if resolved is None:
        resolved = fee_resolver.resolve_fee(
            program_code=resolved_program.code,
            nationality=application.nationality,
            country=getattr(application, "country", None),
        )

    effective_amount = resolved.amount
    try:
        from apps.documents.fee_waiver_service import FeeWaiverService
        effective_amount = FeeWaiverService.get_effective_fee(
            str(application_id), resolved.amount,
        )
    except Exception:
        _logger.warning(
            "Fee waiver check failed for application %s, using full fee",
            application_id,
            exc_info=True,
        )

    if not snapshot_dict:
        snapshot_dict = {
            "expected_amount": str(effective_amount),
            "currency": resolved.currency,
            "residency_category": resolved.residency_category,
            "program_code": resolved_program.code,
            "intake_id": str(getattr(application, "intake_id", "") or "") or None,
            "waiver_applied": str(effective_amount) != str(resolved.amount),
            "original_amount": str(resolved.amount),
            "fee_source": resolved.source,
        }

    return resolved, effective_amount, snapshot_dict


def _check_retry_limit(application_id, max_attempts: int, exclusion_days: int) -> int:
    """Check if the payment retry limit has been reached.

    Returns the current attempt count. Raises ``ValueError`` with code
    ``MAX_PAYMENT_ATTEMPTS_EXCEEDED|0`` if the limit is reached.
    """
    import logging as _logging
    from datetime import timedelta as _td
    from django.utils import timezone as _tz
    from apps.documents.models import Payment as _Payment

    _logger = _logging.getLogger(__name__)

    expired_cutoff = _tz.now() - _td(days=exclusion_days)
    attempt_count = _Payment.objects.filter(
        application_id=application_id,
    ).exclude(
        status='expired', created_at__lt=expired_cutoff,
    ).count()

    if attempt_count >= max_attempts:
        _logger.warning(
            "Payment attempt limit reached for application %s (%d attempts)",
            application_id, attempt_count,
        )
        raise ValueError("MAX_PAYMENT_ATTEMPTS_EXCEEDED|0")

    return attempt_count


def _call_lenco_mobile_money(
    *,
    base_url: str,
    api_secret: str,
    amount: str,
    reference: str,
    phone: str,
    operator: str,
    timeout: int,
) -> tuple[object | None, dict, str | None]:
    """Call Lenco mobile-money collection endpoint.

    Returns ``(response_obj, lenco_data_dict, error_string_or_none)``.
    When ``error_string`` is not None, the HTTP call failed before a response.
    """
    import logging as _logging
    import requests as _http_requests

    _logger = _logging.getLogger(__name__)

    url = f"{base_url.rstrip('/')}/collections/mobile-money"
    try:
        resp = _http_requests.post(
            url,
            json={
                "amount": amount,
                "reference": reference,
                "phone": phone,
                "operator": operator,
                "country": "zm",
                "bearer": "customer",
            },
            headers={
                "Authorization": f"Bearer {api_secret}",
                "User-Agent": "MIHAS/2.0",
                "Accept": "application/json",
            },
            timeout=timeout,
        )
    except _http_requests.RequestException as exc:
        _logger.warning("Lenco mobile-money HTTP error: %s", exc)
        return None, {}, "Provider request failed before a response was received."

    try:
        lenco_data = resp.json() if resp.content else {}
    except ValueError:
        lenco_data = {}

    return resp, lenco_data, None


# ---------------------------------------------------------------------------
# Extracted method implementations - called by PaymentService thin wrappers
# ---------------------------------------------------------------------------

# Admin review status map: frontend status → canonical payment status.
_ADMIN_REVIEW_STATUS_MAP: dict[str, str] = {
    'pending_review': 'pending',
    'verified': 'successful',
    'rejected': 'failed',
    'deferred': 'deferred',
}

# Legacy application-status derivation used by _update_payment_status.
_LEGACY_PAYMENT_TO_APP_STATUS: dict[str, str] = {
    'successful': 'verified',
    'paid': 'verified',
    'failed': 'failed',
}


def _review_application_payment_impl(
    service,
    *,
    application_id,
    payment_status: str,
    reviewed_by_id: str,
    notes: str = "",
):
    """Implementation body for ``PaymentService.review_application_payment``.

    Extracted to reduce payment_service.py line count while keeping the
    method entry point on the class (ADR-007).
    """
    import logging as _logging
    from django.db import transaction
    from django.utils import timezone as _tz
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    _logger = _logging.getLogger(__name__)

    target_payment_status = _ADMIN_REVIEW_STATUS_MAP.get(payment_status)

    with transaction.atomic():
        application = Application.objects.select_for_update().get(id=application_id)
        latest_payment = (
            Payment.objects.select_for_update()
            .filter(application_id=application_id)
            .order_by('-created_at')
            .first()
        )
        synthetic_payment_created = False

        if target_payment_status and latest_payment is None:
            if payment_status in ('verified', 'deferred'):
                latest_payment = Payment.objects.create(
                    application_id=application_id,
                    user_id=application.user_id,
                    status=target_payment_status,
                    amount=0,
                    currency='ZMW',
                    payment_method='admin_override',
                    notes=notes or f'Admin set payment to {payment_status} (no prior record)',
                    verified_by_id=reviewed_by_id if payment_status == 'verified' else None,
                    verified_at=_tz.now() if payment_status == 'verified' else None,
                    metadata={
                        'admin_review': {
                            'status': payment_status,
                            'reviewed_by': reviewed_by_id,
                            'reviewed_at': _tz.now().isoformat(),
                            'notes': notes,
                            'synthetic': True,
                        }
                    },
                )
                _logger.warning(
                    "Admin force-approved payment without record: app=%s admin=%s",
                    application_id, reviewed_by_id,
                )
                synthetic_payment_created = True
            else:
                raise ValueError("PAYMENT_RECORD_REQUIRED")

        now = _tz.now()

        if latest_payment is not None and target_payment_status:
            if (
                _forward_only_enabled()
                and latest_payment.status in ('successful', 'failed', 'expired', 'force_approved')
                and target_payment_status != latest_payment.status
            ):
                raise ValueError("TERMINAL_PAYMENT_IMMUTABLE")
            if (
                _forward_only_enabled()
                and latest_payment.status in ('successful', 'failed', 'expired', 'force_approved')
                and target_payment_status == latest_payment.status
                and not synthetic_payment_created
            ):
                return application
            if (
                not _forward_only_enabled()
                and latest_payment.status in ('successful', 'force_approved')
                and target_payment_status != latest_payment.status
            ):
                raise ValueError("CANNOT_REVERSE_SUCCESSFUL_PAYMENT")

            metadata = latest_payment.metadata or {}
            metadata['admin_review'] = {
                **(
                    metadata.get('admin_review', {})
                    if isinstance(metadata.get('admin_review'), dict)
                    else {}
                ),
                'status': payment_status,
                'reviewed_by': reviewed_by_id,
                'reviewed_at': now.isoformat(),
                'notes': notes,
            }
            from_status = latest_payment.status or ""
            latest_payment.status = target_payment_status
            latest_payment.metadata = metadata
            latest_payment.notes = notes or latest_payment.notes
            latest_payment.verified_by_id = (
                reviewed_by_id
                if payment_status == 'verified'
                and Profile.objects.filter(id=reviewed_by_id).exists()
                else latest_payment.verified_by_id
            )
            latest_payment.verified_at = now if payment_status == 'verified' else latest_payment.verified_at
            latest_payment.updated_at = now
            latest_payment.save(update_fields=[
                'status',
                'metadata',
                'notes',
                'verified_by',
                'verified_at',
                'updated_at',
            ])

            # ADR-007: emit audit for the status transition
            try:
                from uuid import UUID as _UUID
                _actor = _UUID(reviewed_by_id) if reviewed_by_id else None
            except (ValueError, TypeError):
                _actor = None
            service._emit_audit(
                "payment.transitioned",
                latest_payment,
                _actor,
                {
                    "source": "admin_override",
                    "from_status": from_status,
                    "target_status": target_payment_status,
                    "reason": notes or "admin review",
                },
            )

        application.payment_status = payment_status
        if notes:
            application.admin_feedback = notes
            application.admin_feedback_date = now
            application.admin_feedback_by_id = (
                reviewed_by_id
                if Profile.objects.filter(id=reviewed_by_id).exists()
                else application.admin_feedback_by_id
            )
        application.updated_at = now
        application.save(update_fields=[
            'payment_status',
            'admin_feedback',
            'admin_feedback_date',
            'admin_feedback_by',
            'updated_at',
        ])

        try:
            from apps.common.communication_service import CommunicationService
            template = 'payment_verified' if target_payment_status == 'successful' else 'payment_rejected'
            CommunicationService.send(template, application)
        except Exception:
            _logger.exception(
                "Failed to send payment review notification for application %s",
                application_id,
            )

        return application


def _process_webhook_event_impl(service, event_type: str, reference: str, payload: dict) -> None:
    """Implementation body for ``PaymentService.process_webhook_event``.

    Extracted to reduce payment_service.py line count while keeping the
    method entry point on the class (ADR-007).
    """
    import logging as _logging
    from django.db import transaction
    from django.utils import timezone as _tz
    from apps.documents.models import Payment

    _logger = _logging.getLogger(__name__)

    try:
        with transaction.atomic():
            payment = (
                Payment.objects.select_for_update()
                .get(transaction_reference=reference)
            )
    except Payment.DoesNotExist:
        _logger.warning("Webhook references unknown payment: reference=%s", reference)
        return

    data = payload.get('data', {})

    if event_type == 'collection.successful':
        from apps.documents.payment_state_machine import check_legacy_mismatch
        mismatch = check_legacy_mismatch(data, payment.amount, payment.currency)
        if mismatch is not None:
            _logger.warning("Webhook %s for payment %s -- skipping", mismatch[0], payment.id)
            return
        service._update_payment_status(payment, 'successful', data)

    elif event_type == 'collection.failed':
        service._update_payment_status(payment, 'failed', data)

    elif event_type == 'collection.settled':
        meta = payment.metadata or {}
        meta['settlement'] = data.get('settlement', data)
        payment.metadata = meta
        payment.updated_at = _tz.now()
        payment.save(update_fields=['metadata', 'updated_at'])
        _logger.info("Settlement metadata updated for payment %s", payment.id)

    else:
        _logger.info("Ignoring unrecognised webhook event_type=%s", event_type)


__all__ = [
    "_ADMIN_REVIEW_STATUS_MAP",
    "_AIRTEL_PREFIXES",
    "_LEGACY_PAYMENT_TO_APP_STATUS",
    "_MTN_PREFIXES",
    "_PII_KEYS_IN_LENCO_RESPONSE",
    "_build_snapshot_dict",
    "_call_lenco_collection_status",
    "_call_lenco_mobile_money",
    "_check_retry_limit",
    "_classify_mobile_money_response",
    "_forward_only_enabled",
    "_generate_receipt_number",
    "_generate_reference",
    "_normalize_phone_e164",
    "_operator_for_msisdn",
    "_parse_amount",
    "_process_webhook_event_impl",
    "_resolve_fee_for_application",
    "_review_application_payment_impl",
    "_sanitize_lenco_response",
]
