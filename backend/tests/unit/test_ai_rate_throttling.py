"""Tests for AIUserScopedRateThrottle.

Covers:
- Flag-off: throttle is a no-op (returns None cache key).
- Flag-on: per-user cache key format.
- Flag-on anonymous: falls back to IP-based key.
- Flag-on missing scope: returns None (safe default).
- Cache keys are disjoint from PaymentUserScopedRateThrottle keys.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from django.test import override_settings

from apps.common.throttling import (
    AIUserScopedRateThrottle,
    PaymentUserScopedRateThrottle,
)


def _auth_request(pk: str = "user-123"):
    user = SimpleNamespace(is_authenticated=True, pk=pk, id=pk)
    return SimpleNamespace(
        user=user,
        META={"REMOTE_ADDR": "10.0.0.1"},
    )


def _anon_request(ip: str = "10.0.0.42"):
    user = SimpleNamespace(is_authenticated=False)
    return SimpleNamespace(
        user=user,
        META={"REMOTE_ADDR": ip},
    )


def _view(scope: str):
    return SimpleNamespace(throttle_scope=scope)


# ---------------------------------------------------------------------------
# Flag-off pass-through
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_RATE_LIMITS=False)
def test_flag_off_returns_none_cache_key():
    throttle = AIUserScopedRateThrottle()
    key = throttle.get_cache_key(_auth_request(), _view("ai_admin_summary"))
    assert key is None


# ---------------------------------------------------------------------------
# Flag-on: cache key shape
# ---------------------------------------------------------------------------


@override_settings(AI_HARDENING_RATE_LIMITS=True)
def test_flag_on_authenticated_user_keyed_by_pk():
    throttle = AIUserScopedRateThrottle()
    key = throttle.get_cache_key(_auth_request("abc-123"), _view("ai_admin_summary"))
    assert key == "throttle_ai_admin_summary_ai_user_abc-123"


@override_settings(AI_HARDENING_RATE_LIMITS=True)
def test_flag_on_anonymous_request_keyed_by_ip():
    throttle = AIUserScopedRateThrottle()
    key = throttle.get_cache_key(_anon_request("203.0.113.5"), _view("ai_admin_summary"))
    assert key is not None
    assert "203.0.113.5" in key
    assert key.startswith("throttle_ai_admin_summary_ai_user_")


@override_settings(AI_HARDENING_RATE_LIMITS=True)
def test_flag_on_missing_scope_returns_none():
    throttle = AIUserScopedRateThrottle()
    key = throttle.get_cache_key(_auth_request(), SimpleNamespace())
    assert key is None


@override_settings(AI_HARDENING_RATE_LIMITS=True)
def test_ai_and_payment_throttle_keys_are_disjoint():
    """Same user, same scope name — different buckets for payment vs AI."""
    ai = AIUserScopedRateThrottle()
    payment = PaymentUserScopedRateThrottle()

    req = _auth_request("user-xyz")
    ai_key = ai.get_cache_key(req, _view("shared_scope"))

    with override_settings(PAYMENT_HARDENING_RATE_LIMITS=True):
        pay_key = payment.get_cache_key(req, _view("shared_scope"))

    assert ai_key is not None
    assert pay_key is not None
    assert ai_key != pay_key
    # AI key uses the `_ai_` infix.
    assert "_ai_user_" in ai_key
    assert "_ai_user_" not in pay_key


@override_settings(AI_HARDENING_RATE_LIMITS=True)
def test_different_scopes_get_different_keys():
    throttle = AIUserScopedRateThrottle()
    req = _auth_request("user-1")
    k1 = throttle.get_cache_key(req, _view("ai_admin_summary"))
    k2 = throttle.get_cache_key(req, _view("ai_student_preview"))
    assert k1 != k2


@override_settings(AI_HARDENING_RATE_LIMITS=True)
def test_same_user_same_scope_is_same_key():
    """Idempotency: same user + scope must always hash to the same bucket."""
    throttle = AIUserScopedRateThrottle()
    req = _auth_request("steady-user")
    view = _view("ai_admin_summary")
    k1 = throttle.get_cache_key(req, view)
    k2 = throttle.get_cache_key(req, view)
    assert k1 == k2
