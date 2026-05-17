"""Unit tests for Stream 6 — Submission Gates Truth."""
import uuid
from unittest.mock import MagicMock, patch
import pytest


# ─── Helpers ───

def _mock_app(uid=None, status="draft", program="CS", intake="Jan 2026", nrc="123456/78/1"):
    a = MagicMock()
    a.id = uuid.uuid4()
    a.user_id = str(uid or uuid.uuid4())
    a.status = status
    a.program = program
    a.intake = intake
    a.nrc_number = nrc
    a.passport_number = None
    a.payment_status = "successful"
    a.submitted_at = None
    a.is_late_submission = False
    a.review_started_at = None
    a.reviewed_by_id = None
    a.admin_feedback = None
    a.admin_feedback_date = None
    a.admin_feedback_by_id = None
    a.decision_date = None
    a.updated_at = None
    a.eligibility_status = None
    a.eligibility_score = None
    a.eligibility_notes = ""
    a.save = MagicMock()
    return a


# ─── 1. Identity document gate: rejected only → blocked ───

@patch("apps.applications.services.ApplicationDocument.objects")
def test_identity_doc_rejected_only_blocks_submission(mock_doc_qs):
    from apps.applications.services import _application_has_identity_document

    # Only rejected docs exist → filter().exclude() returns empty
    mock_doc_qs.filter.return_value.exclude.return_value.exists.return_value = False
    assert _application_has_identity_document("app-1") is False


# ─── 2. Identity document gate: pending → allowed ───

@patch("apps.applications.services.ApplicationDocument.objects")
def test_identity_doc_pending_allows_submission(mock_doc_qs):
    from apps.applications.services import _application_has_identity_document

    mock_doc_qs.filter.return_value.exclude.return_value.exists.return_value = True
    assert _application_has_identity_document("app-1") is True


# ─── 3. Identity document gate: verified → allowed ───

@patch("apps.applications.services.ApplicationDocument.objects")
def test_identity_doc_verified_allows_submission(mock_doc_qs):
    from apps.applications.services import _application_has_identity_document

    mock_doc_qs.filter.return_value.exclude.return_value.exists.return_value = True
    assert _application_has_identity_document("app-1") is True


# ─── 4. Per-program capacity: max_capacity=2, third submission → PROGRAM_CAPACITY_REACHED ───

@patch("apps.applications.models.Application.objects")
@patch("apps.catalog.models.ProgramIntake.objects")
@patch("apps.applications.identifier_resolver.IdentifierResolver.resolve_program")
@patch("apps.applications.identifier_resolver.IdentifierResolver.resolve_intake")
@patch("apps.catalog.models.Intake.objects")
def test_program_capacity_reached_blocks(mock_intake_qs, mock_resolve_intake, mock_resolve_program, mock_pi_qs, mock_app_qs):
    from apps.applications.intake_enforcer import IntakeEnforcer

    # Setup: intake exists, no deadline, no intake-level capacity
    mock_resolved_intake = MagicMock()
    mock_resolved_intake.source = "db"
    mock_resolved_intake.id = 1
    mock_resolve_intake.return_value = mock_resolved_intake

    mock_resolved_program = MagicMock()
    mock_resolved_program.id = 10
    mock_resolve_program.return_value = mock_resolved_program

    intake_obj = MagicMock()
    intake_obj.application_deadline = None
    intake_obj.max_capacity = None
    mock_intake_qs.filter.return_value.first.return_value = intake_obj

    # ProgramIntake with max_capacity=2
    pi_obj = MagicMock()
    pi_obj.max_capacity = 2
    mock_pi_qs.filter.return_value.first.return_value = pi_obj

    # 2 live applications already
    mock_app_qs.filter.return_value.count.return_value = 2

    result = IntakeEnforcer.check_submission("Jan 2026", "CS")
    assert result.allowed is False
    assert result.code == "PROGRAM_CAPACITY_REACHED"


# ─── 5. DuplicateChecker.check_at_submit: single_active across intakes → has_duplicate ───

@patch("apps.applications.duplicate_checker._load_multi_intake_policy", return_value="single_active")
@patch("apps.applications.duplicate_checker.Application.objects")
def test_duplicate_checker_submit_single_active_cross_intake(mock_app_qs, _mock_policy):
    from apps.applications.duplicate_checker import DuplicateChecker

    uid = str(uuid.uuid4())
    exclude_id = str(uuid.uuid4())

    submitting = MagicMock()
    submitting.nrc_number = "123456/78/1"
    submitting.passport_number = None
    mock_app_qs.get.return_value = submitting

    existing = MagicMock()
    existing.id = uuid.uuid4()
    existing.status = "submitted"
    existing.nrc_number = "123456/78/1"
    existing.passport_number = None

    # single_active: filter without intake, exclude by id
    mock_app_qs.filter.return_value.exclude.return_value = [existing]

    result = DuplicateChecker.check_at_submit(uid, "CS", "Jul 2026", exclude_id)
    assert result.has_duplicate is True

    # Verify filter was called WITHOUT intake
    call_kwargs = mock_app_qs.filter.call_args.kwargs
    assert "intake" not in call_kwargs


# ─── 6. DuplicateChecker.check_at_submit: unrestricted across intakes → no duplicate ───

@patch("apps.applications.duplicate_checker._load_multi_intake_policy", return_value="unrestricted")
@patch("apps.applications.duplicate_checker.Application.objects")
def test_duplicate_checker_submit_unrestricted_cross_intake(mock_app_qs, _mock_policy):
    from apps.applications.duplicate_checker import DuplicateChecker

    uid = str(uuid.uuid4())
    exclude_id = str(uuid.uuid4())

    submitting = MagicMock()
    submitting.nrc_number = "123456/78/1"
    submitting.passport_number = None
    mock_app_qs.get.return_value = submitting

    # unrestricted: filter WITH intake — no matches in same intake
    mock_app_qs.filter.return_value.exclude.return_value = []

    result = DuplicateChecker.check_at_submit(uid, "CS", "Jul 2026", exclude_id)
    assert result.has_duplicate is False

    # Verify filter was called WITH intake
    call_kwargs = mock_app_qs.filter.call_args.kwargs
    assert call_kwargs["intake"] == "Jul 2026"


# ─── 7. submit_application no longer accepts notes kwarg → TypeError ───

def test_submit_application_rejects_notes_kwarg():
    from apps.applications.services import submit_application

    with pytest.raises(TypeError):
        submit_application(
            application=MagicMock(),
            changed_by="user-1",
            notes="should fail",
        )
