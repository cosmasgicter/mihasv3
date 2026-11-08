"""R3 exploration: client identity and document budgets.

Spec: student-journey-repair task 1.3, clauses 1.12 and 1.13 (design R3-a, R3-b).

Behind Caddy the only peer of the backend is the proxy, so ``REMOTE_ADDR`` is a
Docker-network address shared by every student. ``RateLimitMiddleware`` keys on
``key="ip"``, which django-ratelimit resolves from ``REMOTE_ADDR`` alone, so every
real client lands in one bucket. These tests drive the real middleware against
the real (locmem) cache; only the forwarded-header shape differs between the
two simulated clients.

The half of the old design that already holds at HEAD (a public ``REMOTE_ADDR``
is not overridden by a forged ``X-Forwarded-For`` in the middleware's main path)
is preservation property (j), task 2.2, not an exploration case.
"""
from __future__ import annotations

import pytest
from django.http import JsonResponse
from django.test import RequestFactory

from apps.common.middleware import RateLimitMiddleware
from apps.common.request_utils import get_client_ip

# A Docker bridge address: what ``web`` sees as REMOTE_ADDR behind Caddy.
PROXY_ADDR = "172.18.0.5"
CLIENT_A = "198.51.100.10"
CLIENT_B = "203.0.113.20"

# (label, method, path, requests that exhaust the scope at HEAD or after the fix)
SCOPES = [
    ("login", "post", "/api/v1/auth/login/", 10),
    ("register", "post", "/api/v1/auth/register/", 5),
    ("document upload", "post", "/api/v1/documents/upload/", 60),
    ("document read", "get", "/api/v1/documents/11111111-1111-4111-8111-111111111111/info/", 300),
    ("catch-all", "get", "/api/v1/catalog/programs/", 120),
]


def _ok(_request):
    return JsonResponse({"success": True}, status=200)


def _request(method: str, path: str, *, forwarded: str):
    factory = RequestFactory()
    return getattr(factory, method)(
        path, REMOTE_ADDR=PROXY_ADDR, HTTP_X_FORWARDED_FOR=forwarded
    )


@pytest.mark.parametrize("label,method,path,limit", SCOPES, ids=[s[0] for s in SCOPES])
def test_each_real_client_has_its_own_bucket_behind_the_proxy(label, method, path, limit):
    middleware = RateLimitMiddleware(_ok)

    # Exhaust client A. The cap is generous (limit + a margin) so a fixed scope
    # that raised its figure is still driven to its limit.
    limited_a = False
    for _ in range(limit + 50):
        if middleware(_request(method, path, forwarded=CLIENT_A)).status_code == 429:
            limited_a = True
            break
    assert limited_a, f"{label}: client A was never limited; the scope is not exercised"

    # Client B arrives through the same proxy address with a different client
    # address. HEAD keys both on REMOTE_ADDR, so B inherits A's exhausted bucket.
    response_b = middleware(_request(method, path, forwarded=CLIENT_B))
    assert response_b.status_code == 200, (
        f"{label}: client B was limited by client A's traffic (shared bucket)"
    )


def test_get_client_ip_returns_an_untrusted_remote_addr_not_the_forwarded_value():
    request = RequestFactory().get(
        "/api/v1/auth/session/",
        REMOTE_ADDR="203.0.113.9",  # public: not a trusted proxy
        HTTP_X_FORWARDED_FOR="198.51.100.77",  # chosen by the caller
    )

    # HEAD returns the forwarded value because it trusts the header from any peer.
    assert get_client_ip(request) == "203.0.113.9"


DOCUMENT_VIEWS = [
    "DocumentUploadView",
    "DocumentDeleteView",
    "DocumentSignedUrlView",
    "DocumentDownloadView",
    "DocumentInfoView",
    "DocumentExtractView",
]


def test_document_views_carry_the_per_user_document_throttle():
    from apps.common import throttling
    from apps.documents import document_storage_views as views

    throttle = throttling.DocumentUserRateThrottle  # AttributeError at HEAD
    for name in DOCUMENT_VIEWS:
        classes = getattr(views, name).throttle_classes
        assert throttle in classes, f"{name} has no per-user document throttle"


def test_reads_and_writes_spend_separate_per_user_budgets(monkeypatch):
    from django.core.cache import cache
    from rest_framework.test import APIRequestFactory

    from apps.common import throttling

    class _User:
        pk = "00000000-0000-4000-8000-0000000000aa"
        is_authenticated = True

    cache.clear()
    factory = APIRequestFactory()
    throttle_cls = throttling.DocumentUserRateThrottle  # AttributeError at HEAD
    monkeypatch.setattr(
        throttle_cls, "THROTTLE_RATES", {"documents_read": "2/hour", "documents_write": "1/hour"}
    )

    def hit(method: str) -> bool:
        request = getattr(factory, method)("/api/v1/documents/x/")
        request.user = _User()
        return throttle_cls().allow_request(request, view=None)

    assert [hit("post"), hit("post")] == [True, False]  # write budget: 1
    # Spending the write budget leaves the read budget untouched.
    assert [hit("get"), hit("get"), hit("get")] == [True, True, False]  # read budget: 2
