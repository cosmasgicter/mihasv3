"""Properties for the platform-simplification-and-polish spec.

Property numbers are those of
``.kiro/specs/platform-simplification-and-polish/design.md``.
"""
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from django.test import override_settings
from rest_framework.test import APIRequestFactory

from apps.common.meta_views import PlatformMetaView


# Feature: platform-simplification-and-polish, Property 8: Metadata reports configuration, never a fixed readiness
# Validates: Requirements 3.1
@settings(max_examples=20, deadline=None)
@given(flag=st.booleans())
def test_property_8_metadata_reports_configuration_never_fixed_readiness(flag):
    with override_settings(ENABLE_JOBS_OPS_ROUTES=flag):
        request = APIRequestFactory().get("/api/v1/meta/platform/")
        response = PlatformMetaView.as_view()(request)
    assert response.status_code == 200
    assert response.data["features"]["jobs_ops"] is flag
    assert "status" not in response.data


# Feature: platform-simplification-and-polish, Property 9: OCR runs only for opted-in institutions
# Validates: Requirements 11.2


@pytest.mark.django_db
@settings(
    max_examples=40,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    # Which of four institutions are in the opt-in set, and which one owns the document.
    opted_in=st.lists(st.booleans(), min_size=4, max_size=4),
    owner_index=st.integers(min_value=0, max_value=3),
)
def test_property_9_ocr_runs_only_for_opted_in_institutions(opted_in, owner_index):
    import uuid
    from unittest.mock import MagicMock, patch

    from rest_framework.test import APIClient

    from apps.accounts.authentication import JWTUser
    from apps.common.models import Setting
    from apps.documents.ocr_policy import OCR_OPT_IN_SETTING_KEY
    from tests.ocr_fixtures import opt_in_ocr
    from tests.tenant_fixtures import build_document, build_institution, build_tenant_world

    Setting.objects.filter(key=OCR_OPT_IN_SETTING_KEY).delete()
    world = build_tenant_world(application_status="draft")
    others = [build_institution() for _ in range(3)]
    institutions = others[:owner_index] + [world.institution] + others[owner_index:]
    chosen = [inst for inst, flag in zip(institutions, opted_in) if flag]
    if chosen:
        opt_in_ocr(*chosen)
    document = build_document(application=world.application, document_type="result_slip")

    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(world.student.id),
                "email": world.student.email,
                "role": world.student.role,
                "first_name": world.student.first_name,
                "last_name": world.student.last_name,
            }
        )
    )
    with patch("apps.documents.tasks.extract_document_text_task") as task:
        task.delay.return_value = MagicMock(id="task-" + uuid.uuid4().hex[:6])
        response = client.post(f"/api/v1/documents/{document.id}/extract/", data={}, format="json")

    owner_opted_in = opted_in[owner_index]
    if owner_opted_in:
        assert response.status_code == 202, response.content
        assert task.delay.call_count == 1
    else:
        assert response.status_code == 409
        assert response.json()["code"] == "OCR_NOT_ENABLED"
        task.delay.assert_not_called()


# Feature: platform-simplification-and-polish, Property 3: Next actions follow the wizard's step order
# Validates: Requirements 14.3
@settings(max_examples=60, deadline=None)
@given(
    codes=st.lists(
        st.sampled_from(
            [
                "PROFILE_INCOMPLETE",
                "MINIMUM_GRADES_REQUIRED",
                "PROGRAM_ELIGIBILITY_NOT_MET",
                "IDENTITY_DOCUMENT_REQUIRED",
                "REQUIRED_DOCUMENT_MISSING",
                "PAYMENT_REQUIRED",
                "FEE_NOT_CONFIGURED",
                "PROGRAM_CAPACITY_REACHED",
                "INTAKE_DEADLINE_PASSED",
                "DUPLICATE_SUBMITTED_APPLICATION",
                "CONFIRM_SUBMISSION_REQUIRED",
                "SOMETHING_UNREGISTERED",
            ]
        ),
        min_size=1,
        max_size=12,
    ),
    can_submit=st.booleans(),
)
def test_property_3_next_actions_follow_the_wizard_step_order(codes, can_submit):
    from apps.applications.readiness_service import STEP_RANK, ReadinessBlocker, build_next_actions

    blockers = [ReadinessBlocker(code, "test", f"blocked by {code}") for code in codes]
    actions = build_next_actions(blockers, can_submit=can_submit, status="draft")
    assert actions, "the student is never dead-ended"
    derived = actions[1:] if can_submit else actions
    if can_submit:
        assert actions[0]["action"] == "submit-application"
    ranks = [STEP_RANK.get(action["step"], STEP_RANK["submit"]) for action in derived]
    assert ranks == sorted(ranks)
    # Each action appears once, whatever the number of blockers that map to it.
    names = [action["action"] for action in actions]
    assert len(names) == len(set(names))


# Feature: platform-simplification-and-polish, Property 10: Fee estimate agrees with the binding quote
# Validates: Requirements 14.5
@settings(max_examples=80, deadline=None)
@given(
    cents=st.integers(min_value=1, max_value=50_000_000),
    percent=st.decimals(min_value=0, max_value=10, places=2),
    fixed=st.decimals(min_value=0, max_value=50, places=2),
    cap=st.decimals(min_value=0, max_value=100, places=2),
    bearer=st.sampled_from(["customer", "merchant"]),
)
def test_property_10_fee_estimate_agrees_with_the_binding_quote(cents, percent, fixed, cap, bearer):
    from decimal import Decimal
    from types import SimpleNamespace

    from apps.documents.fee_quote_service import _money, fee_preview_payload, provider_fee_policy

    amount = Decimal(cents) / Decimal(100)
    resolved = SimpleNamespace(amount=amount, currency="ZMW", residency_category="local", source="program_fee")
    with override_settings(
        PAYMENT_PROVIDER_FEE_PERCENT=str(percent),
        PAYMENT_PROVIDER_FEE_FIXED=str(fixed),
        PAYMENT_PROVIDER_FEE_CAP=str(cap),
        PAYMENT_PROVIDER_FEE_BEARER=bearer,
    ):
        preview = fee_preview_payload(resolved)
        # What the quote mint computes for the same base (fee_quote_service.mint):
        policy = provider_fee_policy()
        base = _money(amount)
        quote_fee = policy.compute(base)
        quote_total = _money(base + quote_fee)
    assert preview["is_binding_quote"] is False
    assert Decimal(preview["amount"]) == base
    assert Decimal(preview["provider_fee_estimate"]) == quote_fee
    assert Decimal(preview["customer_total"]) == quote_total
    assert Decimal(preview["customer_total"]) == base + Decimal(preview["provider_fee_estimate"])
    # Every money string carries exactly two decimals, so the client never rounds.
    for key in ("amount", "provider_fee_estimate", "customer_total"):
        assert len(preview[key].split(".")[1]) == 2
    if bearer == "merchant":
        assert Decimal(preview["provider_fee_estimate"]) == 0
