"""Unit tests for encrypted audit network context."""

from types import SimpleNamespace
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.test import RequestFactory, SimpleTestCase, override_settings

from apps.accounts.admin_views import AuditLogSerializer
from apps.common.audit_network import build_audit_network_fields, decrypt_network_value


class TestAuditNetworkContext(SimpleTestCase):
    @override_settings(AUDIT_LOG_ENCRYPTION_KEY=Fernet.generate_key().decode())
    def test_build_audit_network_fields_stores_hashes_and_encrypted_values(self):
        # XFF format: "<spoofable>, <real-client-from-trusted-proxy>".
        # With NUM_PROXIES=1 the canonical extractor takes the rightmost
        # trusted hop ("10.0.0.1"), ignoring the leftmost (spoofable) entry.
        request = RequestFactory().post(
            "/api/v1/applications/",
            HTTP_X_FORWARDED_FOR="203.0.113.10, 10.0.0.1",
            HTTP_USER_AGENT="Mozilla/5.0 test",
        )

        fields = build_audit_network_fields(request)

        self.assertEqual(len(fields["ip_address"]), 64)
        self.assertEqual(len(fields["user_agent"]), 64)
        self.assertNotEqual(fields["ip_address"], "10.0.0.1")
        self.assertNotEqual(fields["user_agent"], "Mozilla/5.0 test")
        self.assertTrue(fields["ip_address_encrypted"])
        self.assertTrue(fields["user_agent_encrypted"])
        self.assertEqual(decrypt_network_value(fields["ip_address_encrypted"]), "10.0.0.1")
        self.assertEqual(decrypt_network_value(fields["user_agent_encrypted"]), "Mozilla/5.0 test")

    @override_settings(AUDIT_LOG_ENCRYPTION_KEY=Fernet.generate_key().decode())
    def test_audit_log_serializer_reveals_raw_network_context_only_to_super_admin(self):
        request = RequestFactory().get("/api/v1/admin/audit-logs/")
        encrypted_ip = build_audit_network_fields(
            RequestFactory().post("/x", REMOTE_ADDR="198.51.100.7", HTTP_USER_AGENT="UA/1.0")
        )
        log = SimpleNamespace(
            id="audit-1",
            actor_id=None,
            action="POST",
            entity_type="applications",
            entity_id=None,
            changes={},
            ip_address=encrypted_ip["ip_address"],
            user_agent=encrypted_ip["user_agent"],
            ip_address_encrypted=encrypted_ip["ip_address_encrypted"],
            user_agent_encrypted=encrypted_ip["user_agent_encrypted"],
            retention_category="standard",
            created_at="2026-04-21T10:00:00Z",
        )

        request.user = SimpleNamespace(is_authenticated=True, role="admin")
        admin_serializer = AuditLogSerializer(log, context={"request": request})
        self.assertEqual(admin_serializer.data["ip_hash"], encrypted_ip["ip_address"])
        self.assertIsNone(admin_serializer.data["request_ip"])
        self.assertIsNone(admin_serializer.data["request_user_agent"])

        request.user = SimpleNamespace(is_authenticated=True, role="super_admin")
        super_admin_serializer = AuditLogSerializer(log, context={"request": request})
        self.assertEqual(super_admin_serializer.data["request_ip"], "198.51.100.7")
        self.assertEqual(super_admin_serializer.data["request_user_agent"], "UA/1.0")
