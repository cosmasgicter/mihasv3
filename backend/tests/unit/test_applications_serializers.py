"""Tests for Applications serializers (T15 — API remediation Phase 3).

Validates request-body serializer contracts for the 9 applications business-
logic endpoints. Envelope preservation behavior is covered by existing view
tests (test_amendments.py, test_reviewer_assignment.py, etc.).
"""
from __future__ import annotations

import uuid

import pytest


# ---- Amendment request ----

def test_amendment_request_serializer_happy_path():
    from apps.applications.serializers import ApplicationAmendmentRequestSerializer

    s = ApplicationAmendmentRequestSerializer(
        data={"field_name": "phone", "new_value": "0977999000", "reason": "typo"}
    )
    assert s.is_valid(), s.errors


def test_amendment_request_rejects_missing_fields():
    from apps.applications.serializers import ApplicationAmendmentRequestSerializer

    s = ApplicationAmendmentRequestSerializer(data={})
    assert not s.is_valid()
    assert set(s.errors.keys()) == {"field_name", "new_value", "reason"}


def test_amendment_request_rejects_non_amendable_field():
    from apps.applications.serializers import ApplicationAmendmentRequestSerializer

    s = ApplicationAmendmentRequestSerializer(
        data={"field_name": "program", "new_value": "Nursing", "reason": "changed my mind"}
    )
    assert not s.is_valid()
    assert "field_name" in s.errors


def test_amendment_request_validates_email_and_phone_values():
    from apps.applications.serializers import ApplicationAmendmentRequestSerializer

    invalid_email = ApplicationAmendmentRequestSerializer(
        data={"field_name": "email", "new_value": "not-an-email", "reason": "typo"}
    )
    invalid_phone = ApplicationAmendmentRequestSerializer(
        data={"field_name": "phone", "new_value": "123", "reason": "new number"}
    )

    assert not invalid_email.is_valid()
    assert "new_value" in invalid_email.errors
    assert not invalid_phone.is_valid()
    assert "new_value" in invalid_phone.errors


# ---- Amendment review ----

def test_amendment_review_rejects_invalid_status():
    from apps.applications.serializers import ApplicationAmendmentReviewRequestSerializer

    s = ApplicationAmendmentReviewRequestSerializer(data={"status": "pending"})
    assert not s.is_valid()
    assert "status" in s.errors


def test_amendment_review_accepts_approved_or_rejected():
    from apps.applications.serializers import ApplicationAmendmentReviewRequestSerializer

    for decision in ("approved", "rejected"):
        s = ApplicationAmendmentReviewRequestSerializer(data={"status": decision})
        assert s.is_valid(), s.errors


# ---- Assign ----

def test_assign_serializer_requires_uuid():
    from apps.applications.serializers import ApplicationAssignRequestSerializer

    s = ApplicationAssignRequestSerializer(data={})
    assert not s.is_valid()
    s = ApplicationAssignRequestSerializer(data={"reviewer_id": "not-a-uuid"})
    assert not s.is_valid()
    s = ApplicationAssignRequestSerializer(data={"reviewer_id": str(uuid.uuid4())})
    assert s.is_valid(), s.errors


# ---- Fee waiver ----

def test_fee_waiver_serializer_happy_path():
    from apps.applications.serializers import ApplicationFeeWaiverRequestSerializer

    s = ApplicationFeeWaiverRequestSerializer(
        data={
            "waiver_type": "full",
            "reason_code": "need_based",
            "discount_percentage": 100,
            "notes": "approved by super-admin",
        }
    )
    assert s.is_valid(), s.errors


def test_fee_waiver_rejects_invalid_type():
    from apps.applications.serializers import ApplicationFeeWaiverRequestSerializer

    s = ApplicationFeeWaiverRequestSerializer(
        data={"waiver_type": "none", "reason_code": "x"}
    )
    assert not s.is_valid()
    assert "waiver_type" in s.errors


def test_fee_waiver_clamps_discount_percentage():
    from apps.applications.serializers import ApplicationFeeWaiverRequestSerializer

    s = ApplicationFeeWaiverRequestSerializer(
        data={"waiver_type": "partial", "reason_code": "x", "discount_percentage": 150}
    )
    assert not s.is_valid()
    assert "discount_percentage" in s.errors


# ---- Confirm enrollment / auto-assign (empty body) ----

def test_confirm_enrollment_accepts_empty_body():
    from apps.applications.serializers import ApplicationConfirmEnrollmentRequestSerializer

    s = ApplicationConfirmEnrollmentRequestSerializer(data={})
    assert s.is_valid(), s.errors


def test_auto_assign_accepts_empty_body():
    from apps.applications.serializers import ApplicationAutoAssignRequestSerializer

    s = ApplicationAutoAssignRequestSerializer(data={})
    assert s.is_valid(), s.errors


# ---- View wiring ----

# The AI-summary views these two tests used to check were REMOVED by admissions-v2
# task 7.4 (R11.1 — "no generative AI touches admissions data or decisions"), and
# `ApplicationAiSummaryResponseSerializer` went with them. The imports therefore
# raised `ImportError` and both tests failed for asserting the wiring of endpoints
# the platform deliberately deleted.
#
# The references are gone and the retirement is pinned instead (13.6 remediation
# M3): deleting an assertion that names a retired symbol should leave behind a
# statement that the symbol is retired, not a silence.


def test_student_views_declare_serializer_class():
    """Each view has serializer_class set so drf-spectacular resolves it."""
    from apps.applications.student_views import (
        ApplicationAmendmentView,
        ApplicationConfirmEnrollmentView,
        ApplicationWaitlistPositionView,
    )
    from apps.applications.serializers import (
        ApplicationAmendmentRequestSerializer,
        ApplicationConfirmEnrollmentRequestSerializer,
        ApplicationWaitlistPositionResponseSerializer,
    )

    assert ApplicationAmendmentView.serializer_class is ApplicationAmendmentRequestSerializer
    assert ApplicationConfirmEnrollmentView.serializer_class is ApplicationConfirmEnrollmentRequestSerializer
    assert ApplicationWaitlistPositionView.serializer_class is ApplicationWaitlistPositionResponseSerializer


def test_admin_views_declare_serializer_class():
    from apps.applications.admin_views import (
        ApplicationAmendmentReviewView,
        ApplicationAssignView,
        ApplicationAutoAssignView,
        ApplicationFeeWaiverView,
    )
    from apps.applications.serializers import (
        ApplicationAmendmentReviewRequestSerializer,
        ApplicationAssignRequestSerializer,
        ApplicationAutoAssignRequestSerializer,
        ApplicationFeeWaiverRequestSerializer,
    )

    assert ApplicationAssignView.serializer_class is ApplicationAssignRequestSerializer
    assert ApplicationAutoAssignView.serializer_class is ApplicationAutoAssignRequestSerializer
    assert ApplicationFeeWaiverView.serializer_class is ApplicationFeeWaiverRequestSerializer
    assert ApplicationAmendmentReviewView.serializer_class is ApplicationAmendmentReviewRequestSerializer


def test_the_retired_ai_summary_wiring_stays_retired():
    """The three symbols task 7.4 removed must not come back (R11.1).

    ``tests/unit/test_no_admissions_generative_ai_guard.py`` already fails if a
    retired *route* is re-registered. This is the serializer-wiring half of the
    same statement, filed where the stale assertions used to live so a future
    reader finds the retirement rather than a gap.
    """
    from apps.applications import admin_views, serializers, student_views

    retired = (
        (student_views, "ApplicationPreviewSummaryView"),
        (admin_views, "ApplicationAdminSummaryView"),
        (serializers, "ApplicationAiSummaryResponseSerializer"),
    )
    present = [
        f"{module.__name__}.{name}"
        for module, name in retired
        if hasattr(module, name)
    ]
    assert present == [], (
        "task 7.4 (R11.1) removed these; re-adding one reintroduces an "
        f"admissions generative-AI surface: {present}"
    )
