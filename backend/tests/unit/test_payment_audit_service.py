"""Unit tests for :mod:`apps.documents.payment_audit_service`.

Covers Task 12.2 of the payment-hardening spec.

Scope:

* Every standard action writes ``entity_type='payment'``,
  ``entity_id=<payment.id>``, and ``action=<event_type>``.
* Action prefixes ``payment.force_approved``,
  ``payment.super_admin_corrected``, ``payment.dev_bypass_used``, and
  ``payment.rate_limited`` are promoted to ``retention_category='security'``.
* Other actions default to ``retention_category='standard'``.
* When a ``request`` with a client IP and user-agent is supplied, the IP
  and UA land in the ``ip_address`` / ``user_agent`` columns as SHA-256
  hex values, never plaintext.
* Empty ``metadata`` is accepted and results in ``changes`` being an empty
  dict (plus any auto-added redacted keys — never raw PII).

Requirements: R17.1, R22.4, R22.5.
"""

from __future__ import annotations

import hashlib
import os
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402

from apps.documents.payment_audit_service import (  # noqa: E402
    SECURITY_RETENTION_ACTION_PREFIXES,
    PaymentAuditService,
)


_AUDIT_LOG_PATCH_TARGET = "apps.common.models.AuditLog"


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _make_request(ip: str = "203.0.113.10", ua: str = "Mozilla/5.0 test"):
    """Build a lightweight object that quacks like a Django HttpRequest."""
    return SimpleNamespace(
        META={
            "REMOTE_ADDR": ip,
            "HTTP_USER_AGENT": ua,
        }
    )


# ---------------------------------------------------------------------------
# Core entity shape
# ---------------------------------------------------------------------------


class TestRecordPaymentEventEntityShape(SimpleTestCase):
    """Every audit row must identify the correct payment entity."""

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_standard_action_writes_entity_type_and_id(self, mock_audit_log):
        payment_id = uuid.uuid4()

        PaymentAuditService.record_payment_event(
            action="payment.initiated",
            payment_id=payment_id,
            application_id=uuid.uuid4(),
            actor_id=uuid.uuid4(),
            actor_role=None,
            metadata={"source": "initiate"},
        )

        mock_audit_log.objects.create.assert_called_once()
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["entity_type"], "payment")
        self.assertEqual(kwargs["entity_id"], payment_id)
        self.assertEqual(kwargs["action"], "payment.initiated")

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_multiple_actions_each_write_the_supplied_action(self, mock_audit_log):
        payment_id = uuid.uuid4()
        actions = [
            "payment.initiated",
            "payment.transitioned",
            "payment.risk_flag",
            "payment.receipt.generated",
            "payment.expired_by_reconciliation",
            "payment.late_failed_webhook_ignored",
        ]

        for action in actions:
            PaymentAuditService.record_payment_event(
                action=action,
                payment_id=payment_id,
                application_id=None,
                actor_id=None,
                actor_role=None,
                metadata={},
            )

        self.assertEqual(mock_audit_log.objects.create.call_count, len(actions))
        written_actions = [
            call.kwargs["action"]
            for call in mock_audit_log.objects.create.call_args_list
        ]
        self.assertEqual(written_actions, actions)
        for call in mock_audit_log.objects.create.call_args_list:
            self.assertEqual(call.kwargs["entity_type"], "payment")
            self.assertEqual(call.kwargs["entity_id"], payment_id)


# ---------------------------------------------------------------------------
# Retention promotion
# ---------------------------------------------------------------------------


class TestRecordPaymentEventRetention(SimpleTestCase):
    """Security-sensitive action prefixes bump retention to 365 days."""

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_force_approved_promoted_to_security(self, mock_audit_log):
        PaymentAuditService.record_payment_event(
            action="payment.force_approved",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=uuid.uuid4(),
            actor_role="admin",
            metadata={"reason": "provable offline payment"},
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["retention_category"], "security")

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_super_admin_corrected_promoted_to_security(self, mock_audit_log):
        PaymentAuditService.record_payment_event(
            action="payment.super_admin_corrected",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=uuid.uuid4(),
            actor_role="super_admin",
            metadata={"reason": "wrong status set by reconcile"},
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["retention_category"], "security")

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_dev_bypass_used_promoted_to_security(self, mock_audit_log):
        PaymentAuditService.record_payment_event(
            action="payment.dev_bypass_used",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata={},
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["retention_category"], "security")

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_rate_limited_promoted_to_security(self, mock_audit_log):
        PaymentAuditService.record_payment_event(
            action="payment.rate_limited",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata={},
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["retention_category"], "security")

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_standard_action_stays_standard(self, mock_audit_log):
        for action in (
            "payment.initiated",
            "payment.transitioned",
            "payment.risk_flag",
            "payment.receipt.generated",
            "payment.expired_by_reconciliation",
        ):
            PaymentAuditService.record_payment_event(
                action=action,
                payment_id=uuid.uuid4(),
                application_id=None,
                actor_id=None,
                actor_role=None,
                metadata={},
            )
        for call in mock_audit_log.objects.create.call_args_list:
            self.assertEqual(call.kwargs["retention_category"], "standard")

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_caller_requested_security_is_not_downgraded(self, mock_audit_log):
        """``retention_category='security'`` passed explicitly is preserved."""
        PaymentAuditService.record_payment_event(
            action="payment.transitioned",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata={},
            retention_category="security",
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["retention_category"], "security")

    def test_security_retention_prefix_tuple_matches_spec(self):
        """Guard against drift between the service's promotion list and
        the payment-hardening design document."""
        self.assertEqual(
            set(SECURITY_RETENTION_ACTION_PREFIXES),
            {
                "payment.force_approved",
                "payment.super_admin_corrected",
                "payment.dev_bypass_used",
                "payment.rate_limited",
            },
        )


# ---------------------------------------------------------------------------
# Request → network hashing
# ---------------------------------------------------------------------------


class TestRecordPaymentEventRequestHashing(SimpleTestCase):
    """The supplied request's IP and UA must be hashed, never stored raw."""

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_request_ip_and_ua_land_in_audit_as_sha256_hex(self, mock_audit_log):
        ip = "198.51.100.42"
        ua = "curl/8.4.0"
        request = _make_request(ip=ip, ua=ua)

        PaymentAuditService.record_payment_event(
            action="payment.initiated",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata={},
            request=request,
        )

        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["ip_address"], _sha256(ip))
        self.assertEqual(kwargs["user_agent"], _sha256(ua))
        # Plaintext values must never land in the audit row.
        self.assertNotEqual(kwargs["ip_address"], ip)
        self.assertNotEqual(kwargs["user_agent"], ua)
        # Hashes are 64-char lowercase hex.
        self.assertEqual(len(kwargs["ip_address"]), 64)
        self.assertEqual(len(kwargs["user_agent"]), 64)

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_request_respects_x_forwarded_for(self, mock_audit_log):
        """XFF-aware helper is reused — client IP is the first hop."""
        request = SimpleNamespace(
            META={
                "HTTP_X_FORWARDED_FOR": "203.0.113.5, 10.0.0.1",
                "REMOTE_ADDR": "10.0.0.1",
                "HTTP_USER_AGENT": "Mozilla/5.0",
            }
        )

        PaymentAuditService.record_payment_event(
            action="payment.initiated",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata={},
            request=request,
        )

        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["ip_address"], _sha256("203.0.113.5"))

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_no_request_results_in_null_network_columns(self, mock_audit_log):
        PaymentAuditService.record_payment_event(
            action="payment.initiated",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata={},
            request=None,
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertIsNone(kwargs["ip_address"])
        self.assertIsNone(kwargs["user_agent"])


# ---------------------------------------------------------------------------
# Metadata handling
# ---------------------------------------------------------------------------


class TestRecordPaymentEventMetadata(SimpleTestCase):
    """``changes`` is always a dict — empty in, empty (or actor_role only) out."""

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_empty_metadata_produces_empty_changes_dict(self, mock_audit_log):
        PaymentAuditService.record_payment_event(
            action="payment.transitioned",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata={},
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["changes"], {})

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_none_metadata_produces_empty_changes_dict(self, mock_audit_log):
        PaymentAuditService.record_payment_event(
            action="payment.transitioned",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata=None,
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["changes"], {})

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_actor_role_is_copied_into_changes(self, mock_audit_log):
        PaymentAuditService.record_payment_event(
            action="payment.force_approved",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=uuid.uuid4(),
            actor_role="admin",
            metadata={"reason": "proof-of-payment verified offline"},
        )
        kwargs = mock_audit_log.objects.create.call_args.kwargs
        self.assertEqual(kwargs["changes"].get("actor_role"), "admin")
        self.assertEqual(
            kwargs["changes"].get("reason"),
            "proof-of-payment verified offline",
        )

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_metadata_is_redacted_before_persistence(self, mock_audit_log):
        payload = {
            "phone": "+260971234567",
            "nrc_number": "123456/78/9",
            "notes": "hello",
            "document_body": "raw pdf bytes",
            "nested": {"passport_no": "AB1234567"},
        }

        PaymentAuditService.record_payment_event(
            action="payment.initiated",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata=payload,
        )

        kwargs = mock_audit_log.objects.create.call_args.kwargs
        changes = kwargs["changes"]

        self.assertNotIn("document_body", changes)
        self.assertIsInstance(changes["phone"], dict)
        self.assertEqual(changes["phone"]["phone_last4"], "4567")
        self.assertEqual(len(changes["phone"]["phone_hash"]), 16)
        self.assertEqual(len(changes["nrc_number"]), 16)
        self.assertEqual(len(changes["nested"]["passport_no"]), 16)
        self.assertEqual(changes["notes"], "hello")
        # Redacted strings are hex — never the original value.
        self.assertNotIn("123456/78/9", changes["nrc_number"])
        self.assertNotIn("+260971234567", str(changes["phone"]))


# ---------------------------------------------------------------------------
# Error swallowing
# ---------------------------------------------------------------------------


class TestRecordPaymentEventErrorSwallowing(SimpleTestCase):
    """A transient audit-writer failure must not abort the caller."""

    @patch(_AUDIT_LOG_PATCH_TARGET)
    def test_db_failure_is_swallowed(self, mock_audit_log):
        mock_audit_log.objects.create.side_effect = RuntimeError("boom")

        # Should not raise.
        PaymentAuditService.record_payment_event(
            action="payment.initiated",
            payment_id=uuid.uuid4(),
            application_id=None,
            actor_id=None,
            actor_role=None,
            metadata={},
        )
        mock_audit_log.objects.create.assert_called_once()


# ---------------------------------------------------------------------------
# _redact_pii — direct assertions
# ---------------------------------------------------------------------------


class TestRedactPiiDirect(SimpleTestCase):
    """Unit-level coverage for the redaction helper."""

    def test_phone_key_variants_all_redacted(self):
        raw = {
            "phone": "+260971111111",
            "Phone": "+260971111112",
            "PHONE_NUMBER": "+260971111113",
            "msisdn": "260971111114",
            "mobile": "0971111115",
            "customer_mobile_number": "0971111116",
        }
        redacted = PaymentAuditService._redact_pii(raw)
        for key, value in redacted.items():
            self.assertIsInstance(value, dict, f"{key} not redacted to dict")
            self.assertIn("phone_hash", value)
            self.assertIn("phone_last4", value)
            self.assertEqual(len(value["phone_hash"]), 16)

    def test_hash_key_variants_all_redacted(self):
        raw = {
            "nrc_number": "123456/78/9",
            "passport_no": "AB1234567",
            "card_number": "4111 1111 1111 1111",
            "pan": "4111111111111111",
            "CVV": "123",
        }
        redacted = PaymentAuditService._redact_pii(raw)
        for key, value in redacted.items():
            self.assertIsInstance(value, str, f"{key} not redacted to hex")
            self.assertEqual(len(value), 16, f"{key} hex length wrong")

    def test_stripped_keys_are_removed(self):
        raw = {
            "document_body": b"\x00\x01pdf",
            "file_content": "long text",
            "raw_payload": {"inner": "stuff"},
            "keep": "ok",
        }
        redacted = PaymentAuditService._redact_pii(raw)
        self.assertNotIn("document_body", redacted)
        self.assertNotIn("file_content", redacted)
        self.assertNotIn("raw_payload", redacted)
        self.assertEqual(redacted["keep"], "ok")

    def test_nested_dict_and_list_redaction(self):
        raw = {
            "level1": {
                "phone": "+260971234567",
                "list": [
                    {"passport_no": "AB9876543"},
                    {"document_body": "secret"},
                    {"ok": "value"},
                ],
            }
        }
        redacted = PaymentAuditService._redact_pii(raw)
        self.assertIsInstance(redacted["level1"]["phone"], dict)
        self.assertEqual(
            redacted["level1"]["phone"]["phone_last4"], "4567"
        )
        self.assertEqual(len(redacted["level1"]["list"][0]["passport_no"]), 16)
        self.assertNotIn("document_body", redacted["level1"]["list"][1])
        self.assertEqual(redacted["level1"]["list"][2]["ok"], "value")

    def test_non_pii_scalars_pass_through(self):
        raw = {
            "status": "pending",
            "amount": 153.0,
            "currency": "ZMW",
            "flag": True,
            "nullable": None,
        }
        self.assertEqual(PaymentAuditService._redact_pii(raw), raw)
