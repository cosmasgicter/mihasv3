"""Unit tests — ``WebhookProcessor.validate_signature`` (Task 25.1).

These tests pin down the HMAC-SHA512 signature path used by the Lenco
webhook ingress (R8.1, R8.2). The algorithm, per Lenco's docs, is:

    webhook_hash_key = SHA-256(LENCO_API_SECRET_KEY).hexdigest()
    expected         = HMAC-SHA512(raw_body, webhook_hash_key).hexdigest()
    valid            = hmac.compare_digest(expected, signature)

Scope of this module
--------------------
* A correctly computed signature is accepted (happy path).
* A tampered body (same signature, mutated bytes) is rejected.
* An arbitrary wrong signature is rejected.
* An empty/missing ``LENCO_API_SECRET_KEY`` short-circuits to ``False``
  without attempting a constant-time compare.
* Every validation path that reaches the comparison stage delegates to
  ``hmac.compare_digest`` (constant-time). The empty-key short-circuit
  returns ``False`` *before* comparison, so it is excluded from the
  constant-time assertion.

Validates: Requirements R8.1, R8.2
"""

from __future__ import annotations

import hashlib
import hmac

from django.test import override_settings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_signature(raw_body: bytes, api_secret: str) -> str:
    """Reproduce Lenco's webhook signature algorithm for test vectors.

    The hash-key is the **hex** digest of SHA-256(secret) encoded as
    UTF-8 — this mirrors ``WebhookProcessor.validate_signature``.
    """
    hash_key = hashlib.sha256(api_secret.encode("utf-8")).hexdigest()
    return hmac.new(
        hash_key.encode("utf-8"), raw_body, hashlib.sha512
    ).hexdigest()


_API_SECRET = "test-lenco-secret-key-123"
_RAW_BODY = b'{"event":"collection.successful","data":{"reference":"ABC-1"}}'


# ---------------------------------------------------------------------------
# Happy path — valid signature accepted
# ---------------------------------------------------------------------------


@override_settings(LENCO_API_SECRET_KEY=_API_SECRET)
def test_validate_signature_accepts_valid():
    """A correctly computed HMAC-SHA512 signature validates as True.

    Validates: Requirements R8.1
    """
    from apps.documents.webhook_processor import WebhookProcessor

    signature = _compute_signature(_RAW_BODY, _API_SECRET)

    assert WebhookProcessor().validate_signature(_RAW_BODY, signature) is True


# ---------------------------------------------------------------------------
# Tampered body rejected (same signature, different body)
# ---------------------------------------------------------------------------


@override_settings(LENCO_API_SECRET_KEY=_API_SECRET)
def test_validate_signature_rejects_tampered_body():
    """Same signature + mutated body must not validate.

    Validates: Requirements R8.1, R8.2
    """
    from apps.documents.webhook_processor import WebhookProcessor

    signature = _compute_signature(_RAW_BODY, _API_SECRET)
    tampered = _RAW_BODY.replace(b"ABC-1", b"ABC-2")

    assert (
        WebhookProcessor().validate_signature(tampered, signature) is False
    )


# ---------------------------------------------------------------------------
# Arbitrary wrong signature rejected
# ---------------------------------------------------------------------------


@override_settings(LENCO_API_SECRET_KEY=_API_SECRET)
def test_validate_signature_rejects_invalid_signature():
    """An arbitrary wrong signature must not validate.

    Validates: Requirements R8.1, R8.2
    """
    from apps.documents.webhook_processor import WebhookProcessor

    # 128-char hex string of all zeros — same length as a real HMAC-SHA512
    # digest, but guaranteed not to match the real signature.
    bogus_signature = "0" * 128

    assert (
        WebhookProcessor().validate_signature(_RAW_BODY, bogus_signature)
        is False
    )


# ---------------------------------------------------------------------------
# Empty key short-circuits to False
# ---------------------------------------------------------------------------


@override_settings(LENCO_API_SECRET_KEY="")
def test_validate_signature_returns_false_on_empty_key():
    """An empty ``LENCO_API_SECRET_KEY`` returns False (no comparison).

    Guards against a mis-configured environment silently accepting every
    webhook as valid.

    Validates: Requirements R8.1
    """
    from apps.documents.webhook_processor import WebhookProcessor

    signature = "anything"
    assert (
        WebhookProcessor().validate_signature(_RAW_BODY, signature) is False
    )


# ---------------------------------------------------------------------------
# Constant-time compare is used for every validation path that reaches
# the comparison stage.
# ---------------------------------------------------------------------------


@override_settings(LENCO_API_SECRET_KEY=_API_SECRET)
def test_validate_signature_uses_constant_time_compare(monkeypatch):
    """Every non-empty-key validation path delegates to ``hmac.compare_digest``.

    We monkeypatch the ``hmac.compare_digest`` symbol imported by
    ``webhook_processor`` and count calls across three validation
    invocations — valid, invalid, and tampered. Each invocation must
    trigger exactly one constant-time compare; the empty-key path is
    excluded because it short-circuits before comparison (see the
    dedicated test above).

    Validates: Requirements R8.1
    """
    from apps.documents import webhook_processor as wp

    calls: list[tuple[str, str]] = []
    real_compare_digest = hmac.compare_digest

    def _counting_compare_digest(a, b):
        calls.append((str(a)[:16], str(b)[:16]))
        return real_compare_digest(a, b)

    monkeypatch.setattr(wp.hmac, "compare_digest", _counting_compare_digest)

    processor = wp.WebhookProcessor()
    valid_sig = _compute_signature(_RAW_BODY, _API_SECRET)

    # Path 1: valid signature — expect one compare_digest call.
    assert processor.validate_signature(_RAW_BODY, valid_sig) is True
    assert len(calls) == 1, (
        "Expected exactly one hmac.compare_digest call after the valid-"
        f"signature path; got {len(calls)}."
    )

    # Path 2: arbitrary wrong signature — second compare_digest call.
    assert processor.validate_signature(_RAW_BODY, "0" * 128) is False
    assert len(calls) == 2, (
        "Expected a second hmac.compare_digest call after the invalid-"
        f"signature path; got {len(calls)} total."
    )

    # Path 3: tampered body — third compare_digest call.
    tampered = _RAW_BODY.replace(b"ABC-1", b"ABC-2")
    assert processor.validate_signature(tampered, valid_sig) is False
    assert len(calls) == 3, (
        "Expected a third hmac.compare_digest call after the tampered-"
        f"body path; got {len(calls)} total."
    )
