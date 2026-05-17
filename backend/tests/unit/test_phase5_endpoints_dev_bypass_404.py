"""Unit tests — Phase 5 endpoint dev-bypass lockout (Task 48.1).

Asserts that the two new Phase 5 payment endpoints —
:class:`SuperAdminPaymentCorrectionView` (``POST
/api/v1/payments/<uuid>/correct/``) and :class:`RiskFlagsListView`
(``GET /api/v1/payments/risk-flags/``) — return a bare HTTP 404 with
an empty body whenever any known dev-bypass vector is present on a
request issued under production settings
(``DEBUG=False`` and ``DJANGO_ENV='production'``).

Both views are decorated with
``@require_not_dev_bypass_in_production`` from
:mod:`apps.common.dev_bypass`, which short-circuits with a
``django.http.HttpResponse(status=404)`` — no JSON envelope, no body —
when production posture is detected. Any leakage (non-404 status, non-
empty body, envelope keys) would confirm the route exists and would
defeat R16's design goal of making the dev-bypass affordance
**indistinguishable from a missing route** on live traffic.

Matrix under test
-----------------

* **Endpoints** — the two Phase 5 views:
  :class:`SuperAdminPaymentCorrectionView` (super-admin override) and
  :class:`RiskFlagsListView` (super-admin risk review).
* **Vectors** — the four ``DEV_BYPASS_PARAM_NAMES`` entries from
  :mod:`apps.common.dev_bypass`, exercised as query-string parameters
  which work uniformly on GET and POST: ``dev-bypass``, ``dev_bypass``,
  ``DEV_BYPASS_AUTH``, ``dev``.

An extension block at the bottom covers the two
``DEV_BYPASS_HEADER_NAMES`` vectors so the full decorator surface is
asserted for both endpoints, per the R16.3 mandate that "every payment
view returns HTTP 404 for Dev_Bypass attempts when production settings
are active".

Auth shape
----------

Both views sit behind ``IsAuthenticated + IsSuperAdmin``. DRF's
``APIView.dispatch`` runs ``check_permissions`` *before* calling the
handler, which is the method wrapped by the decorator — so the test
must authenticate as a super-admin to make sure the request actually
reaches ``post``/``get`` and the decorator gets a chance to fire. If
auth/permissions were missing we would see a 401/403 from DRF and
would never observe the lockout.

Throttling is a no-op here because the payment-hardening rate-limit
flag (``PAYMENT_HARDENING_RATE_LIMITS``) defaults to ``False``;
``PaymentUserScopedRateThrottle.get_cache_key`` returns ``None`` and
DRF skips the bucket.

Validates: Requirements R16.1, R16.3
"""

from __future__ import annotations

import json
import uuid

import pytest
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.common.dev_bypass import (
    DEV_BYPASS_HEADER_NAMES,
    DEV_BYPASS_PARAM_NAMES,
)
from apps.documents.risk_views import RiskFlagsListView
from apps.documents.views import SuperAdminPaymentCorrectionView


def _header_to_meta(name: str) -> str:
    """Convert an HTTP header name to its Django ``request.META`` key.

    Mirrors :func:`apps.common.dev_bypass._header_name_to_meta_key`
    so this test file does not depend on a private helper.
    """
    return "HTTP_" + name.upper().replace("-", "_")


# ---------------------------------------------------------------------------
# Vector matrices
# ---------------------------------------------------------------------------

#: Four query-string vectors — the full ``DEV_BYPASS_PARAM_NAMES`` set.
#: Sorted for stable parametrisation ids. Both GET and POST surface the
#: query-string the same way to the detector (``request.GET``), so a
#: single vector tuple works for both endpoints.
QUERY_VECTORS: tuple[str, ...] = tuple(sorted(DEV_BYPASS_PARAM_NAMES))

#: Two header vectors — the full ``DEV_BYPASS_HEADER_NAMES`` set,
#: converted to the Django ``META`` form (``HTTP_<UPPER_WITH_UNDERSCORES>``)
#: that ``APIRequestFactory`` forwards into ``request.META``.
HEADER_VECTORS: tuple[tuple[str, str], ...] = tuple(
    (name, _header_to_meta(name))
    for name in sorted(DEV_BYPASS_HEADER_NAMES)
)


# ---------------------------------------------------------------------------
# Shared fixture — a super-admin Profile + matching JWTUser
# ---------------------------------------------------------------------------


@pytest.fixture
def super_admin_user(db):
    """Seed a ``super_admin`` Profile and return the matching ``JWTUser``.

    Both Phase 5 endpoints use ``IsAuthenticated + IsSuperAdmin``; the
    dev-bypass decorator runs *after* these permission checks, so the
    test must authenticate as a super-admin to observe the lockout.
    """
    from apps.accounts.models import Profile

    now = timezone.now()
    profile = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"bypass-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Bypass",
        last_name="Tester",
        role="super_admin",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    return JWTUser(
        {
            "user_id": str(profile.id),
            "email": profile.email,
            "role": "super_admin",
            "first_name": profile.first_name,
            "last_name": profile.last_name,
        }
    )


def _assert_locked_out(response) -> None:
    """Assert a response matches the dev-bypass lockout contract.

    The decorator returns ``HttpResponse(status=404)`` with no body, no
    envelope, no ``data`` / ``success`` keys. Anything richer than a
    bare 404 would let a caller distinguish a "locked" route from a
    truly missing route — the exact property R16 forbids.
    """
    assert response.status_code == 404, (
        f"Expected dev-bypass lockout to return 404; got "
        f"{response.status_code}. Body: {getattr(response, 'content', b'')!r}."
    )

    # ``HttpResponse(status=404)`` with no body renders as an empty
    # byte-string. Some Django configs may inject a ``Content-Type``
    # header but the body itself stays empty.
    content = getattr(response, "content", b"")
    assert content == b"", (
        f"Dev-bypass 404 must have an empty body; got {content!r}."
    )

    # Defence in depth — no envelope keys may leak through. A
    # ``HttpResponse`` does not expose ``.data`` at all, but if a
    # subclass ever does, the lockout must not carry envelope data.
    data = getattr(response, "data", None)
    assert data is None or data == {} or data == b"", (
        f"Dev-bypass 404 must not carry an envelope body; got {data!r}."
    )


# ---------------------------------------------------------------------------
# Request builders — one per endpoint, vector-agnostic
# ---------------------------------------------------------------------------


def _dispatch_super_admin_correction(
    *,
    jwt_user: JWTUser,
    query_string: str = "",
    extra_headers: dict[str, str] | None = None,
    body: dict | None = None,
):
    """Issue a ``POST /api/v1/payments/<uuid>/correct/`` via the view.

    The ``payment_id`` is a freshly minted UUID — the decorator must
    fire *before* the view tries to load the Payment, so the row need
    not exist. An authenticated super-admin is used to get past the
    permission layer.
    """
    payment_id = uuid.uuid4()
    path = f"/api/v1/payments/{payment_id}/correct/"
    if query_string:
        path = f"{path}?{query_string}"

    factory = APIRequestFactory()
    payload = dict(body or {})
    request = factory.post(
        path,
        data=json.dumps(payload) if payload else "",
        content_type="application/json",
        **(extra_headers or {}),
    )
    force_authenticate(request, user=jwt_user)
    return SuperAdminPaymentCorrectionView.as_view()(
        request, payment_id=str(payment_id)
    )


def _dispatch_risk_flags_list(
    *,
    jwt_user: JWTUser,
    query_string: str = "",
    extra_headers: dict[str, str] | None = None,
):
    """Issue a ``GET /api/v1/payments/risk-flags/`` via the view."""
    path = "/api/v1/payments/risk-flags/"
    if query_string:
        path = f"{path}?{query_string}"

    factory = APIRequestFactory()
    request = factory.get(path, **(extra_headers or {}))
    force_authenticate(request, user=jwt_user)
    return RiskFlagsListView.as_view()(request)


# ===========================================================================
# Query-string vectors — 2 endpoints × 4 DEV_BYPASS_PARAM_NAMES
# ===========================================================================


@pytest.mark.django_db
@override_settings(DEBUG=False, DJANGO_ENV="production")
class TestPhase5EndpointsRejectQueryDevBypass(TestCase):
    """``?<param>=1`` on either Phase 5 endpoint → HTTP 404 empty body.

    Parametrises across the full ``DEV_BYPASS_PARAM_NAMES`` set so every
    query-string vector recognised by the decorator is exercised.

    Validates: Requirements R16.1, R16.3
    """

    @pytest.mark.parametrize(
        "vector", QUERY_VECTORS, ids=[f"query_{v}" for v in QUERY_VECTORS]
    )
    def test_super_admin_correction_returns_404(self, super_admin_user, vector):
        response = _dispatch_super_admin_correction(
            jwt_user=super_admin_user,
            query_string=f"{vector}=1",
        )
        _assert_locked_out(response)

    @pytest.mark.parametrize(
        "vector", QUERY_VECTORS, ids=[f"query_{v}" for v in QUERY_VECTORS]
    )
    def test_risk_flags_list_returns_404(self, super_admin_user, vector):
        response = _dispatch_risk_flags_list(
            jwt_user=super_admin_user,
            query_string=f"{vector}=1",
        )
        _assert_locked_out(response)


# ===========================================================================
# Header vectors — 2 endpoints × 2 DEV_BYPASS_HEADER_NAMES
#
# Covers the remaining decorator surface (R16.3: "every payment view
# returns HTTP 404 for Dev_Bypass attempts") so the matrix is complete
# even though the mandated parametrisation is the four query-param
# names above.
# ===========================================================================


@pytest.mark.django_db
@override_settings(DEBUG=False, DJANGO_ENV="production")
class TestPhase5EndpointsRejectHeaderDevBypass(TestCase):
    """``X-Dev-Bypass[-Auth]: 1`` on either Phase 5 endpoint → 404.

    Validates: Requirements R16.1, R16.3
    """

    @pytest.mark.parametrize(
        "header_name,meta_key",
        HEADER_VECTORS,
        ids=[f"header_{name}" for name, _ in HEADER_VECTORS],
    )
    def test_super_admin_correction_returns_404(
        self, super_admin_user, header_name, meta_key
    ):
        response = _dispatch_super_admin_correction(
            jwt_user=super_admin_user,
            extra_headers={meta_key: "1"},
        )
        _assert_locked_out(response)

    @pytest.mark.parametrize(
        "header_name,meta_key",
        HEADER_VECTORS,
        ids=[f"header_{name}" for name, _ in HEADER_VECTORS],
    )
    def test_risk_flags_list_returns_404(
        self, super_admin_user, header_name, meta_key
    ):
        response = _dispatch_risk_flags_list(
            jwt_user=super_admin_user,
            extra_headers={meta_key: "1"},
        )
        _assert_locked_out(response)
