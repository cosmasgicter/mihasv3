"""Unit test — Task 46.4: `/correct/` and `/verify/` routes are distinct.

The payment-hardening spec adds ``POST /api/v1/payments/<uuid>/correct/``
as the Super_Admin_Correction_Path (R1.5, R2.5 extended). The route
must resolve to :class:`SuperAdminPaymentCorrectionView` without
colliding with the existing ``POST /api/v1/payments/<uuid>/verify/``
endpoint, which must continue to resolve to :class:`PaymentVerifyView`.

These assertions lock the two routes against accidental
URLconf drift — a reordering, typo, or regex overlap would otherwise
silently route admin corrections into the student-initiated verify
path (or vice versa) with disastrous consequences for the payment
ledger.

Validates: Requirements R22.6
"""

from __future__ import annotations

import uuid

from django.urls import resolve

from apps.documents.payment_admin_views import SuperAdminPaymentCorrectionView
from apps.documents.payment_query_views import PaymentVerifyView


# A valid UUID string that matches the ``<uuid:payment_id>`` converter
# on both URL patterns. A shared value keeps the two resolutions as
# similar as possible so the only difference being tested is the
# final path segment.
_SAMPLE_PAYMENT_ID = "00000000-0000-0000-0000-000000000001"


def test_correct_route_resolves_to_super_admin_view():
    """``/api/v1/payments/<uuid>/correct/`` routes to SuperAdminPaymentCorrectionView.

    Validates: Requirements R22.6
    """
    match = resolve(f"/api/v1/payments/{_SAMPLE_PAYMENT_ID}/correct/")
    actual_view_class = getattr(match.func, "view_class", None)
    assert actual_view_class is SuperAdminPaymentCorrectionView, (
        f"/api/v1/payments/<uuid>/correct/ should resolve to "
        f"SuperAdminPaymentCorrectionView, got "
        f"{actual_view_class.__name__ if actual_view_class else match.func!r}"
    )
    # The URL converter must also capture the UUID into kwargs so the
    # view signature ``def post(self, request, payment_id)`` receives it.
    assert match.kwargs.get("payment_id") == uuid.UUID(_SAMPLE_PAYMENT_ID)


def test_verify_route_still_resolves_to_payment_verify_view():
    """``/api/v1/payments/<uuid>/verify/`` still routes to PaymentVerifyView.

    The addition of the ``/correct/`` route must not disturb the
    pre-existing verify endpoint.

    Validates: Requirements R22.6
    """
    match = resolve(f"/api/v1/payments/{_SAMPLE_PAYMENT_ID}/verify/")
    actual_view_class = getattr(match.func, "view_class", None)
    assert actual_view_class is PaymentVerifyView, (
        f"/api/v1/payments/<uuid>/verify/ should resolve to "
        f"PaymentVerifyView, got "
        f"{actual_view_class.__name__ if actual_view_class else match.func!r}"
    )
    assert match.kwargs.get("payment_id") == uuid.UUID(_SAMPLE_PAYMENT_ID)


def test_routes_are_distinct():
    """The two payment paths must not collide — different view classes.

    An overlap would let an admin correction silently hit the verify
    endpoint (bypassing the ``IsSuperAdmin`` guard) or vice versa. This
    test anchors the contract that each path owns a distinct view.

    Validates: Requirements R22.6
    """
    verify_match = resolve(f"/api/v1/payments/{_SAMPLE_PAYMENT_ID}/verify/")
    correct_match = resolve(f"/api/v1/payments/{_SAMPLE_PAYMENT_ID}/correct/")

    verify_view_class = getattr(verify_match.func, "view_class", None)
    correct_view_class = getattr(correct_match.func, "view_class", None)

    assert verify_view_class is not None
    assert correct_view_class is not None
    assert verify_view_class is not correct_view_class, (
        "The /verify/ and /correct/ payment routes must resolve to "
        "distinct view classes; got the same class "
        f"{verify_view_class.__name__!r} for both."
    )

    # URL names must also be distinct to keep ``reverse()`` unambiguous.
    assert verify_match.url_name != correct_match.url_name, (
        f"URL names collide: both paths resolve to url_name="
        f"{verify_match.url_name!r}."
    )
