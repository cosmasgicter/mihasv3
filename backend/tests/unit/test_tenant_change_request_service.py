"""Tenant change-request service tests (task 4.5, R5.4-R5.5).

Covers the durable submit/cancel/review/apply/notify/audit paths that close
finding TEN-06, plus the R5.5 invariant that approval applies through the SAME
canonical configuration command a Platform_Admin uses directly (never a raw JSON
patch) and retains redacted before/after audit data.

What is pinned here:

* **create/submit** (R5.4) — a request is durable, typed by change kind, and
  moves ``draft -> submitted`` with a submit notification.
* **approve applies via the canonical command** (R5.5) — a profile/program
  approval mutates the canonical row (institution/program) and a domain approval
  creates a ``pending_dns`` domain through the canonical create command; the
  request ends ``applied`` with redacted before/after snapshots.
* **notify** (R5.5, design §17) — every lifecycle command commits a durable
  ``outbox_events`` row (the "queued == committed durable record" contract).
* **audit** (R5.5) — the applied change records BOTH the canonical
  ``tenant.<resource>.<verb>`` config event and the ``tenant.change_request.*``
  lifecycle event; no raw secrets/PII in the snapshots.
* **reject / cancel / invalid-state / apply-time revalidation rollback** (R5.4).

**Validates: Requirements 5.4, 5.5**
"""

from __future__ import annotations

import uuid

import pytest

from apps.catalog.change_request_service import (
    ChangeRequestError,
    TenantChangeRequestService,
)
from apps.catalog.models import InstitutionDomain, Program, TenantChangeRequest
from apps.common.models import AuditLog, OutboxEvent
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_offering,
    build_profile,
)

pytestmark = pytest.mark.django_db

CR = TenantChangeRequest


def _service() -> TenantChangeRequestService:
    return TenantChangeRequestService()


def _outbox(event_type: str, change_request_id):
    return OutboxEvent.objects.filter(
        event_type=event_type,
        aggregate_type="tenant_change_request",
        aggregate_id=change_request_id,
    )


def _audit(action: str, entity_id):
    return AuditLog.objects.filter(action=action, entity_id=entity_id)


# ---------------------------------------------------------------------------
# create / submit (R5.4)
# ---------------------------------------------------------------------------


class TestCreateAndSubmit:
    def test_submit_creates_durable_submitted_request_and_notifies(self):
        inst = build_institution()
        requester = build_profile(role="admin")
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "New Brand"}},
            requested_by_id=requester.id,
        )
        cr.refresh_from_db()
        assert cr.status == CR.STATUS_SUBMITTED
        assert cr.submitted_at is not None
        assert cr.payload == {"fields": {"brand_name": "New Brand"}}
        # Durable notification for the platform review queue (design §17).
        assert _outbox("tenant.change_request.submitted", cr.id).exists()
        assert _audit("tenant.change_request.submitted", cr.id).exists()

    def test_create_draft_without_submit(self):
        inst = build_institution()
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "Draft Brand"}},
            submit=False,
        )
        assert cr.status == CR.STATUS_DRAFT
        assert cr.submitted_at is None
        assert not _outbox("tenant.change_request.submitted", cr.id).exists()

    def test_idempotent_submit_returns_same_request(self):
        inst = build_institution()
        key = f"cr-{uuid.uuid4()}"
        first = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "Idem"}},
            idempotency_key=key,
        )
        second = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "Idem-different"}},
            idempotency_key=key,
        )
        assert first.id == second.id
        assert CR.objects.filter(idempotency_key=key).count() == 1

    @pytest.mark.parametrize(
        "kind,payload,field",
        [
            (CR.KIND_PROFILE, {"fields": {}}, "fields"),
            (CR.KIND_PROFILE, {"fields": {"code": "X"}}, "fields"),  # not requestable
            (CR.KIND_PROGRAM, {"fields": {"name": "x"}}, "program_id"),
            (CR.KIND_DOMAIN, {}, "hostname"),
        ],
    )
    def test_invalid_payload_rejected(self, kind, payload, field):
        inst = build_institution()
        with pytest.raises(ChangeRequestError) as exc:
            _service().create(institution=inst, change_kind=kind, payload=payload)
        assert exc.value.code == "INVALID_PAYLOAD"
        assert field in exc.value.fields


# ---------------------------------------------------------------------------
# approve applies via the SAME canonical command (R5.5)
# ---------------------------------------------------------------------------


class TestApproveAppliesCanonically:
    def test_profile_approval_mutates_institution_via_canonical_command(self):
        inst = build_institution(brand_name="Old Brand")
        reviewer = build_profile(role="super_admin")
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "Approved Brand"}},
        )
        cr = _service().approve(cr, reviewer_id=reviewer.id, note="looks good")
        cr.refresh_from_db()
        inst.refresh_from_db()

        assert cr.status == CR.STATUS_APPLIED
        assert cr.applied_at is not None
        assert cr.reviewed_by_id == reviewer.id
        # The canonical institution row actually changed (not a raw JSON blob).
        assert inst.brand_name == "Approved Brand"
        # before/after snapshots recorded (R5.5).
        assert cr.before_data == {"brand_name": "Old Brand"}
        assert cr.after_data == {"brand_name": "Approved Brand"}
        assert cr.configuration_version == 2
        # BOTH audit events: the canonical config change AND the CR lifecycle.
        assert _audit("tenant.institution.updated", inst.id).exists()
        assert _audit("tenant.change_request.applied", cr.id).exists()
        # Durable tenant notification of the applied change (design §17).
        assert _outbox("tenant.change_request.applied", cr.id).exists()

    def test_program_approval_mutates_offering_via_canonical_command(self):
        inst = build_institution()
        canonical = build_canonical_program()
        program = build_offering(
            institution=inst, canonical_program=canonical, name="Old Name"
        )
        reviewer = build_profile(role="super_admin")
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROGRAM,
            payload={"program_id": str(program.id), "fields": {"name": "New Name"}},
        )
        assert str(cr.target_object_id) == str(program.id)
        cr = _service().approve(cr, reviewer_id=reviewer.id)
        cr.refresh_from_db()
        program.refresh_from_db()

        assert cr.status == CR.STATUS_APPLIED
        assert program.name == "New Name"
        assert cr.before_data == {"name": "Old Name"}
        assert cr.after_data == {"name": "New Name"}
        assert _audit("tenant.program.updated", program.id).exists()

    def test_domain_approval_creates_pending_domain_via_canonical_command(self):
        inst = build_institution()
        reviewer = build_profile(role="super_admin")
        hostname = f"apply-{uuid.uuid4().hex[:10]}.example"
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_DOMAIN,
            payload={"hostname": hostname},
        )
        cr = _service().approve(cr, reviewer_id=reviewer.id)
        cr.refresh_from_db()

        assert cr.status == CR.STATUS_APPLIED
        # A domain was created in pending_dns through the canonical command.
        domain = InstitutionDomain.objects.get(id=cr.target_object_id)
        assert domain.institution_id == inst.id
        assert domain.hostname == hostname
        assert domain.status == InstitutionDomain.STATUS_PENDING_DNS
        assert cr.after_data.get("hostname") == hostname
        assert "dns_record" in cr.after_data
        assert _audit("tenant.domain.created", domain.id).exists()


# ---------------------------------------------------------------------------
# reject / cancel / invalid-state (R5.4)
# ---------------------------------------------------------------------------


class TestRejectCancelInvalidState:
    def test_reject_does_not_touch_canonical_row(self):
        inst = build_institution(brand_name="Untouched")
        reviewer = build_profile(role="super_admin")
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "Rejected Brand"}},
        )
        cr = _service().reject(cr, reviewer_id=reviewer.id, note="not now")
        cr.refresh_from_db()
        inst.refresh_from_db()

        assert cr.status == CR.STATUS_REJECTED
        assert cr.review_note == "not now"
        assert inst.brand_name == "Untouched"  # canonical row unchanged
        assert not _audit("tenant.institution.updated", inst.id).exists()
        assert _outbox("tenant.change_request.rejected", cr.id).exists()

    def test_cancel_from_submitted(self):
        inst = build_institution()
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "Cancel Me"}},
        )
        cr = _service().cancel(cr, note="changed my mind")
        assert cr.status == CR.STATUS_CANCELLED
        assert _outbox("tenant.change_request.cancelled", cr.id).exists()

    def test_cancel_from_draft(self):
        inst = build_institution()
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "Draft Cancel"}},
            submit=False,
        )
        cr = _service().cancel(cr)
        assert cr.status == CR.STATUS_CANCELLED

    def test_approve_non_submitted_is_rejected(self):
        inst = build_institution()
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"brand_name": "Draft"}},
            submit=False,
        )
        with pytest.raises(ChangeRequestError) as exc:
            _service().approve(cr, reviewer_id=build_profile(role="super_admin").id)
        assert exc.value.code == "CHANGE_REQUEST_INVALID_STATE"
        cr.refresh_from_db()
        assert cr.status == CR.STATUS_DRAFT  # unchanged

    def test_apply_time_revalidation_failure_rolls_back_to_submitted(self):
        """An invalid value the canonical serializer rejects at apply time rolls
        the whole approval back — the request stays submitted with last_error,
        and the canonical row is untouched (R5.5)."""
        inst = build_institution(name="Valid Name")
        reviewer = build_profile(role="super_admin")
        # ``name`` has a 255-char max on the canonical serializer; a longer value
        # passes the submit-time shape check but fails apply-time revalidation.
        cr = _service().create(
            institution=inst,
            change_kind=CR.KIND_PROFILE,
            payload={"fields": {"name": "x" * 300}},
        )
        with pytest.raises(ChangeRequestError) as exc:
            _service().approve(cr, reviewer_id=reviewer.id)
        assert exc.value.code == "CHANGE_REQUEST_APPLY_FAILED"
        cr.refresh_from_db()
        inst.refresh_from_db()
        assert cr.status == CR.STATUS_SUBMITTED  # rolled back
        assert cr.last_error
        assert inst.name == "Valid Name"  # canonical row untouched
        assert not _audit("tenant.change_request.applied", cr.id).exists()
