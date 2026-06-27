"""Tests for optional Lenco webhook source allowlisting."""

from django.test import SimpleTestCase

from apps.documents.payment_query_views import _ip_allowed


class LencoWebhookAllowlistTests(SimpleTestCase):
    def test_empty_allowlist_allows_any_ip(self):
        self.assertTrue(_ip_allowed("203.0.113.10", []))

    def test_cidr_allowlist_allows_matching_ip(self):
        self.assertTrue(_ip_allowed("203.0.113.10", ["203.0.113.0/24"]))

    def test_cidr_allowlist_rejects_non_matching_ip(self):
        self.assertFalse(_ip_allowed("198.51.100.10", ["203.0.113.0/24"]))

    def test_exact_ip_allowlist(self):
        self.assertTrue(_ip_allowed("203.0.113.10", ["203.0.113.10"]))
        self.assertFalse(_ip_allowed("203.0.113.11", ["203.0.113.10"]))
