"""The ``ratelimit.limited`` counter (SJR design R3-a/R3-b Observability).

Labels are ``scope`` and ``key_kind`` only, never an address or user id.
"""
from __future__ import annotations

from unittest.mock import patch

from django.http import HttpResponse
from django.test import RequestFactory, override_settings
from rest_framework.test import APIRequestFactory

from apps.common import ratelimit_metrics, throttling
from apps.common.middleware import RateLimitMiddleware

USER_ID = "00000000-0000-4000-8000-0000000000cc"
ADDR = "203.0.113.77"


class _User:
    pk = USER_ID
    is_authenticated = True


def _tags(mock):
    return [c.kwargs["tags"] for c in mock.call_args_list]


def test_record_limited_emits_only_scope_and_key_kind():
    with patch("sentry_sdk.metrics.incr", create=True) as incr:
        ratelimit_metrics.record_limited("api.v1.documents.upload", "ip")
    assert incr.call_args.args[0] == "ratelimit.limited"
    assert _tags(incr) == [{"scope": "api.v1.documents.upload", "key_kind": "ip"}]


def test_record_limited_drops_unknown_key_kind_and_bad_scope():
    with patch("sentry_sdk.metrics.incr", create=True) as incr:
        ratelimit_metrics.record_limited("documents_read", "address")
        ratelimit_metrics.record_limited("bad scope with " + ADDR, "ip")
    incr.assert_not_called()


def test_middleware_429_counts_by_ip():
    mw = RateLimitMiddleware(lambda r: HttpResponse("ok"))
    request = RequestFactory().get("/api/v1/documents/upload/", REMOTE_ADDR=ADDR)
    with patch("django_ratelimit.core.is_ratelimited", return_value=True), patch(
        "sentry_sdk.metrics.incr", create=True
    ) as incr:
        response = mw(request)
    assert response.status_code == 429
    tags = _tags(incr)
    assert len(tags) == 1 and tags[0]["key_kind"] == "ip"
    assert ADDR not in str(tags)


@override_settings(RATELIMIT_ENABLE=True)
def test_document_throttle_refusal_counts_by_user_without_the_id():
    request = APIRequestFactory().post("/api/v1/documents/upload/")
    request.user = _User()
    throttle = throttling.DocumentUserRateThrottle()
    with patch.object(
        throttling.SimpleRateThrottle, "allow_request", return_value=False
    ), patch("sentry_sdk.metrics.incr", create=True) as incr:
        assert throttle.allow_request(request, None) is False
    assert _tags(incr) == [{"scope": "documents_write", "key_kind": "user"}]
    assert USER_ID not in str(_tags(incr))


@override_settings(RATELIMIT_ENABLE=True)
def test_document_throttle_allowed_request_emits_nothing():
    request = APIRequestFactory().get("/api/v1/documents/")
    request.user = _User()
    throttle = throttling.DocumentUserRateThrottle()
    with patch.object(
        throttling.SimpleRateThrottle, "allow_request", return_value=True
    ), patch("sentry_sdk.metrics.incr", create=True) as incr:
        assert throttle.allow_request(request, None) is True
    incr.assert_not_called()
