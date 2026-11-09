"""R3-a/R3-b behaviour of the trusted-proxy client IP and the document throttle.

Spec: student-journey-repair task 3.9 (design R3-a, R3-b), clauses 2.12, 2.13.
Synthetic addresses only (documentation ranges).
"""
from __future__ import annotations

import ipaddress
from unittest.mock import patch

import pytest
from django.test import RequestFactory, override_settings
from rest_framework.test import APIRequestFactory

from apps.common import throttling
from apps.common.request_utils import get_client_ip

NETS = [ipaddress.ip_network("172.16.0.0/12"), ipaddress.ip_network("10.0.0.0/8")]


def _get(remote, forwarded=None):
    extra = {"REMOTE_ADDR": remote}
    if forwarded is not None:
        extra["HTTP_X_FORWARDED_FOR"] = forwarded
    return RequestFactory().get("/", **extra)


@override_settings(NUM_PROXIES=1, TRUSTED_PROXY_CIDRS=NETS)
def test_forwarded_header_from_an_untrusted_peer_is_ignored():
    assert get_client_ip(_get("203.0.113.9", "198.51.100.1")) == "203.0.113.9"


@override_settings(NUM_PROXIES=1, TRUSTED_PROXY_CIDRS=NETS)
def test_trusted_peer_yields_the_rightmost_hop_not_the_forged_left_one():
    assert get_client_ip(_get("172.18.0.5", "192.0.2.50, 198.51.100.7")) == "198.51.100.7"


@override_settings(NUM_PROXIES=2, TRUSTED_PROXY_CIDRS=NETS)
def test_two_hops_skip_the_inner_trusted_proxy():
    assert get_client_ip(_get("172.18.0.5", "192.0.2.50, 198.51.100.7, 10.1.1.1")) == "198.51.100.7"


@override_settings(NUM_PROXIES=1, TRUSTED_PROXY_CIDRS=NETS)
def test_malformed_hop_stops_the_walk_at_the_peer():
    assert get_client_ip(_get("172.18.0.5", "not-an-ip")) == "172.18.0.5"


@override_settings(NUM_PROXIES=0, TRUSTED_PROXY_CIDRS=NETS)
def test_zero_proxies_never_reads_the_header():
    assert get_client_ip(_get("172.18.0.5", "198.51.100.7")) == "172.18.0.5"


@override_settings(NUM_PROXIES=1, TRUSTED_PROXY_CIDRS=NETS)
def test_missing_remote_addr_is_a_fixed_placeholder():
    assert get_client_ip(_get("")) == "0.0.0.0"


class _User:
    pk = "00000000-0000-4000-8000-0000000000bb"
    is_authenticated = True


def _post():
    request = APIRequestFactory().post("/api/v1/documents/upload/")
    request.user = _User()
    return request


@override_settings(RATELIMIT_ENABLE=False)
def test_document_throttle_is_inactive_when_ratelimiting_is_disabled():
    throttle = throttling.DocumentUserRateThrottle()
    assert all(throttle.allow_request(_post(), None) for _ in range(500))


@override_settings(RATELIMIT_ENABLE=True)
def test_document_throttle_fails_open_when_the_cache_is_unavailable():
    throttle = throttling.DocumentUserRateThrottle()
    with patch.object(
        throttling.SimpleRateThrottle, "allow_request", side_effect=ConnectionError("cache down")
    ):
        assert throttle.allow_request(_post(), None) is True


def test_document_budgets_are_configured():
    from django.conf import settings

    rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    assert rates["documents_write"] == "40/hour"
    assert rates["documents_read"] == "300/hour"


def test_retry_after_is_exposed_to_the_cross_origin_frontend():
    from django.conf import settings

    assert "Retry-After" in settings.CORS_EXPOSE_HEADERS


def test_invalid_trusted_proxy_entry_is_rejected_at_startup(monkeypatch):
    import importlib
    from django.core.exceptions import ImproperlyConfigured

    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8,not-a-cidr")
    import config.settings.base as base

    with pytest.raises(ImproperlyConfigured):
        importlib.reload(base)
    monkeypatch.delenv("TRUSTED_PROXY_CIDRS")
    importlib.reload(base)
